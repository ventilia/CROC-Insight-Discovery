package ru.croc.insight.source

import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.jdbc.CannotGetJdbcConnectionException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

enum class Stance { SUPPORTS, NEUTRAL, DOUBTS, OPPOSES }

data class PositionRevision(val version: Int, val stance: Stance, val basis: String, val author: String, val changedAt: Instant)

@Service
class PositionService(
    private val reader: JdbcClient,
    @Value("\${spring.datasource.url}") private val dbUrl: String,
    @Value("\${croc.demo.writer-password:}") private val writerPassword: String,
) {
    private val writer by lazy {
        JdbcClient.create(DriverManagerDataSource(dbUrl, "croc_writer", writerPassword).apply { schema = "insight" })
    }

    internal fun current(initiativeId: UUID, personId: UUID): PositionRevision? =
        reader.sql(
            """
            SELECT version, stance, basis, changed_by, changed_at
            FROM stance_revisions
            WHERE initiative_id = :initiativeId AND contact_id = :personId
            ORDER BY version DESC
            LIMIT 1
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("personId", personId)
            .query { row, _ -> revision(row) }
            .optional()
            .orElse(null)

    internal fun currentForContacts(initiativeId: UUID, ids: List<UUID>): Map<UUID, PositionRevision> {
        if (ids.isEmpty()) return emptyMap()
        return reader.sql(
            """
            SELECT DISTINCT ON (contact_id) contact_id, version, stance, basis, changed_by, changed_at
            FROM stance_revisions
            WHERE initiative_id = :initiativeId AND contact_id IN (:ids)
            ORDER BY contact_id, version DESC
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("ids", ids)
            .query { row, _ -> row.getObject("contact_id", UUID::class.java) to revision(row) }
            .list()
            .toMap()
    }

    internal fun save(
        initiativeId: UUID, personId: UUID, author: String, expectedVersion: Int, stance: Stance, basis: String,
    ): PositionRevision = try {
        writer.sql(
            """
            INSERT INTO stance_revisions (initiative_id, contact_id, version, stance, basis, changed_by)
            SELECT p.initiative_id, p.contact_id, :expectedVersion + 1, :stance, :basis, :author
            FROM initiative_participants p
            JOIN company_viewers v ON v.company_id = p.company_id AND v.viewer_key = :author
            WHERE p.initiative_id = :initiativeId AND p.contact_id = :personId
              AND COALESCE((
                  SELECT max(r.version)
                  FROM stance_revisions r
                  WHERE r.initiative_id = p.initiative_id AND r.contact_id = p.contact_id
              ), 0) = :expectedVersion
            ON CONFLICT (initiative_id, contact_id, version) DO NOTHING
            RETURNING version, stance, basis, changed_by, changed_at
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("personId", personId)
            .param("author", author)
            .param("expectedVersion", expectedVersion)
            .param("stance", stance.name)
            .param("basis", basis.trim())
            .query { row, _ -> revision(row) }
            .optional()
            .orElseThrow { ResponseStatusException(HttpStatus.CONFLICT, "Position version changed") }
    } catch (exception: CannotGetJdbcConnectionException) {
        throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Demo source is unavailable", exception)
    }

    private fun revision(row: ResultSet) = PositionRevision(
        row.getInt("version"),
        Stance.valueOf(row.getString("stance")),
        row.getString("basis"),
        row.getString("changed_by"),
        row.getObject("changed_at", OffsetDateTime::class.java).toInstant(),
    )
}
