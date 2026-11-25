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
    val responsibleManager: String? = null,
    val author: String? = null,
    val comment: String? = null,
    val createdAt: Instant? = null,
    val initiativeId: UUID? = null,
    val initiativeName: String? = null,
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

        return historyPage(Timeline(initiative.id, Scope.INITIATIVE, personId, through, null), limit, cursor)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun companyHistory(
        viewer: String, companyId: UUID, personId: UUID?, limit: Int, cursor: UUID?, through: Instant?, manager: String?,
    ): TouchpointPage? {
        val readable = jdbc.sql(
            """
            SELECT EXISTS (
                SELECT 1 FROM company_viewers v WHERE v.company_id = :companyId AND v.viewer_key = :viewer
                  AND (CAST(:personId AS uuid) IS NULL OR EXISTS (
                      SELECT 1 FROM contacts c WHERE c.company_id = v.company_id AND c.id = :personId
                  ))
            )
            """.trimIndent(),
        ).param("companyId", companyId).param("viewer", viewer).param("personId", personId)
            .query(Boolean::class.javaObjectType).single()
        if (!readable) return null
        return historyPage(Timeline(companyId, Scope.COMPANY, personId, through, manager), limit, cursor)
    }

    private fun historyPage(timeline: Timeline, limit: Int, cursor: UUID?): TouchpointPage {
        val boundary = cursor?.let {
            cursorTime(timeline, it)
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cursor does not match this timeline")
        }
        val events = page(timeline, cursor, boundary, limit + 1)
        if (events.isEmpty()) return TouchpointPage(emptyList(), null)

        val currentPage = events.take(limit)
        val participantsByEvent = eventParticipants(currentPage.map { it.id })
        return TouchpointPage(
            items = currentPage.map { it.copy(participants = participantsByEvent[it.id].orEmpty()) },
            nextCursor = if (events.size > limit) currentPage.last().id else null,
        )
    }

    private fun cursorTime(timeline: Timeline, cursor: UUID): OffsetDateTime? =
        timelineQuery(timeline, "SELECT t.occurred_at", "AND t.id = :cursor")
            .param("cursor", cursor)
            .query(OffsetDateTime::class.java)
            .optional()
            .orElse(null)

    private fun page(
        timeline: Timeline,
        cursor: UUID?,
        cursorAt: OffsetDateTime?,
        count: Int,
    ): List<Touchpoint> =
        timelineQuery(
            timeline,
            """
            SELECT t.id, t.type, t.occurred_at, t.team, t.subject, t.outcome, t.next_step, t.source_label,
                t.responsible_manager, t.created_by, t.comment, t.created_at, i.id AS initiative_id, i.name AS initiative_name
            """.trimIndent(),
            """
            AND (CAST(:cursorAt AS timestamptz) IS NULL OR (t.occurred_at, t.id) < (:cursorAt, :cursor))
            ORDER BY t.occurred_at DESC, t.id DESC
            LIMIT :count
            """.trimIndent(),
        )
            .param("cursor", cursor)
            .param("cursorAt", cursorAt, Types.TIMESTAMP_WITH_TIMEZONE)
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
                    responsibleManager = row.getString("responsible_manager"),
                    author = row.getString("created_by"),
                    comment = row.getString("comment"),
                    createdAt = row.getObject("created_at", OffsetDateTime::class.java)?.toInstant(),
                    initiativeId = row.getObject("initiative_id", UUID::class.java),
                    initiativeName = row.getString("initiative_name"),
                )
            }
            .list()

    private fun timelineQuery(timeline: Timeline, select: String, tail: String): JdbcClient.StatementSpec =
        jdbc.sql(
            """
            $select
            FROM touchpoints t JOIN initiatives i ON i.id = t.initiative_id
            WHERE ${timeline.scope.column} = :scopeId AND $TIMELINE_MATCH
            $tail
            """.trimIndent(),
        ).param("scopeId", timeline.id).param("personId", timeline.personId)
            .param("through", timeline.through?.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
            .param("manager", timeline.manager, Types.VARCHAR)

    private fun eventParticipants(eventIds: List<UUID>): Map<UUID, List<TouchpointParticipant>> =
        jdbc.sql(
            """
            SELECT p.touchpoint_id, c.id, c.name
            FROM touchpoint_participants p
            JOIN contacts c ON c.id = p.contact_id
            WHERE p.touchpoint_id IN (:eventIds)
            ORDER BY p.touchpoint_id, c.id
            """.trimIndent(),
        )
            .param("eventIds", eventIds)
            .query { row, _ ->
                row.getObject("touchpoint_id", UUID::class.java) to
                    TouchpointParticipant(row.getObject("id", UUID::class.java), row.getString("name"))
            }
            .list()
            .groupBy({ it.first }, { it.second })

    private enum class Scope(val column: String) { INITIATIVE("t.initiative_id"), COMPANY("i.company_id") }

    private data class Timeline(
        val id: UUID, val scope: Scope, val personId: UUID?, val through: Instant?, val manager: String?,
    )

    private companion object {
        const val TIMELINE_MATCH = """
            (CAST(:personId AS uuid) IS NULL OR EXISTS (
                SELECT 1 FROM touchpoint_participants p
                WHERE p.initiative_id = t.initiative_id
                  AND p.touchpoint_id = t.id AND p.contact_id = :personId
            ))
            AND (CAST(:through AS timestamptz) IS NULL OR t.occurred_at <= :through)
            AND (CAST(:manager AS text) IS NULL OR t.responsible_manager = :manager)
        """
    }
}
