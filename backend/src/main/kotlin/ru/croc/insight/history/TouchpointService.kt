package ru.croc.insight.history

import java.sql.Types
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.map.ParticipantService

data class TouchpointPage(val items: List<Touchpoint>, val nextCursor: UUID?)

data class Touchpoint(
    val id: UUID,
    val type: String,
    val occurredAt: Instant,
    val team: String,
    val subject: String,
    val outcome: String?,
    val nextStep: String?,
    val sourceLabel: String?,
    val participants: List<TouchpointParticipant> = emptyList(),
)

data class TouchpointParticipant(val id: UUID, val name: String)

@Service
class TouchpointService(
    private val catalog: CatalogService,
    private val participants: ParticipantService,
    private val jdbc: JdbcClient,
) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun history(
        viewer: String, initiativeId: UUID, personId: UUID?, limit: Int, cursor: UUID?, through: Instant?,
    ): TouchpointPage? {
        val initiative = catalog.findInitiative(viewer, initiativeId) ?: return null
        if (personId != null && !participants.exists(initiative.id, personId)) return null

        val throughDate = through?.atOffset(ZoneOffset.UTC)
        val boundary = cursor?.let {
            cursorTime(initiative.id, personId, it, throughDate)
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cursor does not match this timeline")
        }
        val events = page(initiative.id, personId, cursor, boundary, throughDate, limit + 1)
        if (events.isEmpty()) return TouchpointPage(emptyList(), null)

        val currentPage = events.take(limit)
        val participantsByEvent = eventParticipants(initiative.id, currentPage.map { it.id })
        return TouchpointPage(
            items = currentPage.map { it.copy(participants = participantsByEvent[it.id].orEmpty()) },
            nextCursor = if (events.size > limit) currentPage.last().id else null,
        )
    }

    private fun cursorTime(
        initiativeId: UUID, personId: UUID?, cursor: UUID, through: OffsetDateTime?,
    ): OffsetDateTime? =
        jdbc.sql(
            """
            SELECT t.occurred_at
            FROM touchpoints t
            WHERE t.initiative_id = :initiativeId AND t.id = :cursor
              AND $TIMELINE_MATCH
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("personId", personId)
            .param("cursor", cursor)
            .param("through", through, Types.TIMESTAMP_WITH_TIMEZONE)
            .query(OffsetDateTime::class.java)
            .optional()
            .orElse(null)

    private fun page(
        initiativeId: UUID,
        personId: UUID?,
        cursor: UUID?,
        cursorAt: OffsetDateTime?,
        through: OffsetDateTime?,
        count: Int,
    ): List<Touchpoint> =
        jdbc.sql(
            """
            SELECT t.id, t.type, t.occurred_at, t.team, t.subject, t.outcome, t.next_step, t.source_label
            FROM touchpoints t
            WHERE t.initiative_id = :initiativeId
              AND $TIMELINE_MATCH
              AND (CAST(:cursorAt AS timestamptz) IS NULL OR (t.occurred_at, t.id) < (:cursorAt, :cursor))
            ORDER BY t.occurred_at DESC, t.id DESC
            LIMIT :count
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("personId", personId)
            .param("cursor", cursor)
            .param("cursorAt", cursorAt, Types.TIMESTAMP_WITH_TIMEZONE)
            .param("through", through, Types.TIMESTAMP_WITH_TIMEZONE)
            .param("count", count)
            .query { row, _ ->
                Touchpoint(
                    id = row.getObject("id", UUID::class.java),
                    type = row.getString("type"),
                    occurredAt = row.getObject("occurred_at", OffsetDateTime::class.java).toInstant(),
                    team = row.getString("team"),
                    subject = row.getString("subject"),
                    outcome = row.getString("outcome"),
                    nextStep = row.getString("next_step"),
                    sourceLabel = row.getString("source_label"),
                )
            }
            .list()

    private fun eventParticipants(initiativeId: UUID, eventIds: List<UUID>): Map<UUID, List<TouchpointParticipant>> =
        jdbc.sql(
            """
            SELECT p.touchpoint_id, c.id, c.name
            FROM touchpoint_participants p
            JOIN contacts c ON c.id = p.contact_id
            WHERE p.initiative_id = :initiativeId AND p.touchpoint_id IN (:eventIds)
            ORDER BY p.touchpoint_id, c.id
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("eventIds", eventIds)
            .query { row, _ ->
                row.getObject("touchpoint_id", UUID::class.java) to
                    TouchpointParticipant(row.getObject("id", UUID::class.java), row.getString("name"))
            }
            .list()
            .groupBy({ it.first }, { it.second })

    private companion object {
        const val TIMELINE_MATCH = """
            (CAST(:personId AS uuid) IS NULL OR EXISTS (
                SELECT 1 FROM touchpoint_participants p
                WHERE p.initiative_id = t.initiative_id
                  AND p.touchpoint_id = t.id AND p.contact_id = :personId
            ))
            AND (CAST(:through AS timestamptz) IS NULL OR t.occurred_at <= :through)
        """
    }
}
