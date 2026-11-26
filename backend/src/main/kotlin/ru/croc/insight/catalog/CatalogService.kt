package ru.croc.insight.catalog

import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

data class CompanySummary(val id: UUID, val name: String, val industry: String?, val description: String?)

data class InitiativeSummary(
    val id: UUID,
    val companyId: UUID,
    val name: String,
    val asOf: Instant,
    val stage: String? = null,
    val owner: String? = null,
    val due: LocalDate? = null,
    val nextStep: String? = null,
    val participantCount: Long = 0,
)

@Service
class CatalogService(private val jdbc: JdbcClient) {
    fun companies(viewer: String): List<CompanySummary> =
        jdbc.sql(
            """
            SELECT c.id, c.name, c.industry, c.description
            FROM companies c
            JOIN company_viewers v ON v.company_id = c.id
            WHERE v.viewer_key = :viewer
            ORDER BY c.id
            """.trimIndent(),
        )
            .param("viewer", viewer)
            .query { row, _ -> CompanySummary(row.getObject("id", UUID::class.java), row.getString("name"), row.getString("industry"), row.getString("description")) }
            .list()

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun initiatives(viewer: String, companyId: UUID): List<InitiativeSummary>? {
        val visible = jdbc.sql(
            """
            SELECT EXISTS (
                SELECT 1 FROM company_viewers WHERE viewer_key = :viewer AND company_id = :companyId
            )
            """.trimIndent(),
        )
            .param("viewer", viewer)
            .param("companyId", companyId)
            .query(Boolean::class.javaObjectType)
            .single()
        if (!visible) return null

        return jdbc.sql(
            """
            SELECT i.*, (SELECT count(*) FROM initiative_participants p WHERE p.initiative_id = i.id) AS participant_count
            FROM initiatives i
            WHERE i.company_id = :companyId
            ORDER BY i.id
            """.trimIndent(),
        )
            .param("companyId", companyId)
            .query { row, _ -> initiative(row) }
            .list()
    }

    fun findInitiative(viewer: String, initiativeId: UUID): InitiativeSummary? =
        jdbc.sql(
            """
            SELECT i.*, (SELECT count(*) FROM initiative_participants p WHERE p.initiative_id = i.id) AS participant_count
            FROM initiatives i
            JOIN company_viewers v ON v.company_id = i.company_id
            WHERE i.id = :initiativeId AND v.viewer_key = :viewer
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("viewer", viewer)
            .query { row, _ -> initiative(row) }
            .optional()
            .orElse(null)

    private fun initiative(row: ResultSet) = InitiativeSummary(
        id = row.getObject("id", UUID::class.java),
        companyId = row.getObject("company_id", UUID::class.java),
        name = row.getString("name"),
        asOf = row.getObject("as_of", OffsetDateTime::class.java).toInstant(),
        stage = row.getString("stage"),
        owner = row.getString("owner"),
        due = row.getObject("due", LocalDate::class.java),
        nextStep = row.getString("next_step"),
        participantCount = row.getLong("participant_count"),
    )
}
