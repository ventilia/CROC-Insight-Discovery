package ru.croc.insight.history

import java.security.MessageDigest
import java.time.ZoneOffset
import java.util.HexFormat
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.jdbc.CannotGetJdbcConnectionException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.stereotype.Service
import org.springframework.transaction.CannotCreateTransactionException
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException

@Service
class TouchpointWriter(
    @Value("\${spring.datasource.url}") private val dbUrl: String,
    @Value("\${croc.demo.writer-password:}") private val password: String,
) {
    val enabled get() = password.isNotBlank()

    private val dataSource by lazy { DriverManagerDataSource(dbUrl, "croc_writer", password).apply { schema = "insight" } }
    private val jdbc by lazy { JdbcClient.create(dataSource) }
    private val transaction by lazy { TransactionTemplate(DataSourceTransactionManager(dataSource)) }

    fun save(initiative: UUID, author: String, change: TouchpointChange): CreatedTouchpoint {
        if (!enabled) throw unavailable()
        val id = UUID.fromString(change.id)
        val participants = change.participantIds.map { raw ->
            if (raw == null || !identifier.matches(raw)) throw invalidParticipants()
            UUID.fromString(raw)
        }
        if (participants.distinct().size != participants.size) throw invalidParticipants()
        val normalized = change.copy(
            team = change.team.trim(), subject = change.subject.trim(),
            outcome = change.outcome?.trim()?.takeIf(String::isNotEmpty),
            nextStep = change.nextStep?.trim()?.takeIf(String::isNotEmpty),
            comment = change.comment?.trim()?.takeIf(String::isNotEmpty), responsibleManager = change.responsibleManager.trim(),
        )
        val requestFingerprint = fingerprint(initiative, author, normalized, participants.map(UUID::toString))
        try {
            transaction.executeWithoutResult {
                if (!canWrite(initiative, author)) throw ResponseStatusException(HttpStatus.NOT_FOUND)
                if (insert(id, initiative, author, normalized, requestFingerprint) == 0) {
                    val existing = jdbc.sql(
                        "SELECT request_fingerprint FROM touchpoints WHERE id = :id AND initiative_id = :initiative AND created_by = :author",
                    ).param("id", id).param("initiative", initiative).param("author", author)
                        .query(String::class.java).optional().orElse(null)
                    val matchesV5 = existing != null && normalized.comment == null &&
                        existing == fingerprint(initiative, author, normalized, normalized.participantIds.filterNotNull())
                    if (existing != requestFingerprint && !matchesV5) {
                        throw ResponseStatusException(HttpStatus.CONFLICT, "Event ID already used")
                    }
                    return@executeWithoutResult
                }
                val recordedParticipants = jdbc.sql(
                    """
                    INSERT INTO touchpoint_participants (initiative_id, touchpoint_id, contact_id)
                    SELECT initiative_id, :event, contact_id FROM initiative_participants
                    WHERE initiative_id = :initiative AND contact_id IN (:participants)
                    """.trimIndent(),
                ).param("event", id).param("initiative", initiative).param("participants", participants).update()
                if (recordedParticipants != participants.size) throw invalidParticipants()
                jdbc.sql(
                    "UPDATE initiatives SET as_of = :occurredAt WHERE id = :id AND as_of < :occurredAt",
                ).param("id", initiative).param("occurredAt", normalized.occurredAt.atOffset(ZoneOffset.UTC)).update()
            }
        } catch (exception: CannotCreateTransactionException) {
            throw unavailable(exception)
        } catch (exception: CannotGetJdbcConnectionException) {
            throw unavailable(exception)
        }
        return CreatedTouchpoint(id)
    }

    private fun canWrite(initiative: UUID, author: String): Boolean =
        jdbc.sql(
            """
            SELECT EXISTS (
                SELECT 1 FROM initiatives i JOIN company_viewers v ON v.company_id = i.company_id
                WHERE i.id = :initiative AND v.viewer_key = :author
            )
            """.trimIndent(),
        ).param("initiative", initiative).param("author", author).query(Boolean::class.javaObjectType).single()

    private fun insert(id: UUID, initiative: UUID, author: String, change: TouchpointChange, fingerprint: String): Int =
        jdbc.sql(
            """
            INSERT INTO touchpoints (id, initiative_id, type, occurred_at, team, subject, outcome, next_step,
                source_label, responsible_manager, created_by, request_fingerprint, comment, created_at)
            SELECT :id, i.id, :type, :occurredAt, :team, :subject, :outcome, :nextStep,
                'Запись KIT', :manager, :author, :fingerprint, :comment, CURRENT_TIMESTAMP
            FROM initiatives i JOIN company_viewers v ON v.company_id = i.company_id AND v.viewer_key = :author
            WHERE i.id = :initiative
            ON CONFLICT (id) DO NOTHING
            """.trimIndent(),
        ).param("id", id).param("initiative", initiative)
            .param("type", change.type).param("occurredAt", change.occurredAt.atOffset(ZoneOffset.UTC))
            .param("team", change.team).param("subject", change.subject).param("outcome", change.outcome)
            .param("nextStep", change.nextStep).param("manager", change.responsibleManager).param("author", author)
            .param("fingerprint", fingerprint).param("comment", change.comment).update()

    private fun fingerprint(initiative: UUID, author: String, change: TouchpointChange, participants: List<String>): String {
        val base = listOf(
            initiative.toString(), author, change.type, change.occurredAt.toString(), change.team, change.subject,
            change.outcome.orEmpty(), change.nextStep.orEmpty(), change.responsibleManager,
            participants.sorted().joinToString(","),
        )
        val canonical = (base + listOfNotNull(change.comment)).joinToString("") { "${it.length}:$it" }
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8)))
    }

    private fun invalidParticipants() = ResponseStatusException(HttpStatus.BAD_REQUEST, "Participants must belong to this initiative")
    private fun unavailable(cause: Throwable? = null) = ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Event writer is unavailable", cause)

    private companion object {
        val identifier = Regex(ru.croc.insight.UUID_PATTERN)
    }
}
