package ru.croc.insight.history

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.map.Department
import ru.croc.insight.map.ParticipantService

enum class Recency { RECENT, STALE, UNKNOWN }

data class Coverage(
    val initiativeId: UUID,
    val asOf: Instant,
    val days: Int,
    val verificationDays: Int,
    val contacts: List<ContactCoverage>,
    val departments: List<DepartmentCoverage>,
)

data class ContactCoverage(
    val id: UUID,
    val name: String,
    val jobTitle: String?,
    val department: Department?,
    val decisionMaker: Boolean,
    val lastTouchAt: Instant?,
    val touchStatus: Recency,
    val lastVerifiedAt: Instant?,
    val verificationStatus: Recency,
)

data class DepartmentCoverage(
    val id: UUID,
    val name: String,
    val participantCount: Int,
    val recentCount: Int,
    val lastTouchAt: Instant?,
    val touchStatus: Recency,
)

@Service
class CoverageService(
    private val catalog: CatalogService,
    private val participants: ParticipantService,
    private val jdbc: JdbcClient,
) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun find(viewer: String, initiativeId: UUID, days: Int): Coverage? {
        val initiative = catalog.findInitiative(viewer, initiativeId) ?: return null
        val dates = dates(initiativeId, initiative.asOf)
        val touchCutoff = initiative.asOf.minus(Duration.ofDays(days.toLong()))
        val verificationCutoff = initiative.asOf.minus(Duration.ofDays(VERIFICATION_DAYS.toLong()))
        val contacts = participants.list(initiativeId).map { node ->
            val recorded = dates.getValue(node.id)
            ContactCoverage(
                node.id, node.name, node.jobTitle, node.department, node.decisionMaker,
                recorded.touchAt, recency(recorded.touchAt, touchCutoff),
                recorded.verifiedAt, recency(recorded.verifiedAt, verificationCutoff),
            )
        }
        val departments = contacts.filter { it.department != null }.groupBy { requireNotNull(it.department) }
            .map { (department, members) ->
                val latest = members.mapNotNull { it.lastTouchAt }.maxOrNull()
                DepartmentCoverage(
                    department.id, department.name, members.size, members.count { it.touchStatus == Recency.RECENT },
                    latest, recency(latest, touchCutoff),
                )
            }
            .sortedBy { it.name }
        return Coverage(initiativeId, initiative.asOf, days, VERIFICATION_DAYS, contacts, departments)
    }

    private fun dates(initiativeId: UUID, asOf: Instant): Map<UUID, ContactDates> =
        jdbc.sql(
            """
            SELECT c.id, CASE WHEN c.verified_at <= :asOf THEN c.verified_at END AS verified_at,
                   max(t.occurred_at) AS last_touch_at
            FROM initiative_participants p
            JOIN contacts c ON c.id = p.contact_id
            LEFT JOIN touchpoint_participants a ON a.initiative_id = p.initiative_id AND a.contact_id = p.contact_id
            LEFT JOIN touchpoints t ON t.initiative_id = a.initiative_id AND t.id = a.touchpoint_id
                AND t.occurred_at <= :asOf
            WHERE p.initiative_id = :initiativeId
            GROUP BY c.id, c.verified_at
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("asOf", asOf.atOffset(ZoneOffset.UTC))
            .query { row, _ ->
                row.getObject("id", UUID::class.java) to ContactDates(
                    row.getObject("last_touch_at", OffsetDateTime::class.java)?.toInstant(),
                    row.getObject("verified_at", OffsetDateTime::class.java)?.toInstant(),
                )
            }
            .list()
            .toMap()

    private fun recency(at: Instant?, cutoff: Instant): Recency = when {
        at == null -> Recency.UNKNOWN
        at <= cutoff -> Recency.STALE
        else -> Recency.RECENT
    }

    private data class ContactDates(val touchAt: Instant?, val verifiedAt: Instant?)

    private companion object {
        const val VERIFICATION_DAYS = 90
    }
}
