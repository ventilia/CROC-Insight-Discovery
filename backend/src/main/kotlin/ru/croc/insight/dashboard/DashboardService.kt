package ru.croc.insight.dashboard

import java.sql.ResultSet
import java.sql.Types
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
class DashboardService(private val jdbc: JdbcClient) {
    fun dashboard(viewer: String, days: Int): DashboardResponse {
        val totals = scopedQuery(DASHBOARD_SQL, viewer, null, days)
            .query { row, _ ->
                Totals(
                    row.getLong("company_count"), row.getLong("registered_contact_count"),
                    row.getLong("active_interaction_count"), row.instant("earliest_as_of"), row.instant("latest_as_of"),
                )
            }
            .single()
        val risks = risks(viewer, null, days, PORTFOLIO_RISK_LIMIT)
        val companies = jdbc.sql(
            """
            SELECT v.company_id, p.total AS contacts, d.total AS departments,
                   i.total AS initiatives, i.latest_as_of
            FROM company_viewers v
            CROSS JOIN LATERAL (SELECT count(*) AS total FROM contacts WHERE company_id = v.company_id) p
            CROSS JOIN LATERAL (SELECT count(*) AS total FROM departments WHERE company_id = v.company_id) d
            CROSS JOIN LATERAL (
                SELECT count(*) AS total, max(as_of) AS latest_as_of FROM initiatives WHERE company_id = v.company_id
            ) i
            WHERE v.viewer_key = :viewer
            ORDER BY v.company_id
            """.trimIndent(),
        ).param("viewer", viewer).query { row, _ ->
            DashboardCompany(
                row.getObject("company_id", UUID::class.java), row.getLong("initiatives"),
                row.getLong("contacts"), row.getLong("departments"), row.instant("latest_as_of"),
            )
        }.list()
        val recent = jdbc.sql(
            """
            SELECT t.id, i.id AS initiative_id, i.name, t.type, t.occurred_at, t.subject, t.team
            FROM company_viewers v
            JOIN initiatives i ON i.company_id = v.company_id
            JOIN LATERAL (
                SELECT id, type, occurred_at, subject, team FROM touchpoints
                WHERE initiative_id = i.id AND occurred_at <= i.as_of
                ORDER BY occurred_at DESC, id DESC
                LIMIT 4
            ) t ON true
            WHERE v.viewer_key = :viewer
            ORDER BY t.occurred_at DESC, t.id DESC
            LIMIT 4
            """.trimIndent(),
        ).param("viewer", viewer).query { r, _ ->
            DashboardInteraction(
                r.getObject("id", UUID::class.java), r.getObject("initiative_id", UUID::class.java), r.getString("name"),
                r.getString("type"), requireNotNull(r.instant("occurred_at")), r.getString("subject"), r.getString("team"),
            )
        }.list()
        return DashboardResponse(
            days, VERIFICATION_DAYS, totals.companies, totals.contacts, totals.interactions,
            totals.earliestAsOf, totals.latestAsOf, risks.total, risks.facts, companies, recent,
        )
    }

    fun companyInsights(viewer: String, companyId: UUID, days: Int, maxRiskFacts: Int? = null): CompanyInsightsResponse? {
        val rows = scopedQuery(COMPANY_SQL, viewer, companyId, days)
            .query { row, _ ->
                CompanyRow(
                    row.getString("company_name"), row.getLong("registered_contact_count"),
                    row.getObject("initiative_id", UUID::class.java)?.let { initiativeId ->
                        InitiativeActivity(
                            initiativeId, row.getString("initiative_name"), requireNotNull(row.instant("as_of")),
                            row.getLong("active_interaction_count"),
                        )
                    },
                )
            }
            .list()
        val company = rows.firstOrNull() ?: return null
        val initiatives = rows.mapNotNull { it.initiative }
        val risks = risks(viewer, companyId, days, maxRiskFacts)
        return CompanyInsightsResponse(
            companyId, company.name, days, VERIFICATION_DAYS, company.contacts,
            initiatives.sumOf { it.activeInteractionCount }, initiatives.minOfOrNull { it.asOf },
            initiatives.maxOfOrNull { it.asOf }, initiatives, risks.total, risks.facts,
        )
    }

    private fun risks(viewer: String, companyId: UUID?, days: Int, limit: Int?): Risks {
        val rows = scopedQuery(RISKS_SQL, viewer, companyId, days)
            .param("limit", limit, Types.INTEGER)
            .query { row, _ ->
                RiskRow(
                    RiskFact(
                        code = RiskCode.valueOf(row.getString("code")),
                        evidenceStatus = EvidenceStatus.valueOf(row.getString("evidence_status")),
                        companyId = row.getObject("company_id", UUID::class.java),
                        companyName = row.getString("company_name"),
                        initiativeId = row.getObject("initiative_id", UUID::class.java),
                        initiativeName = row.getString("initiative_name"),
                        asOf = requireNotNull(row.instant("as_of")),
                        subjectId = row.getObject("subject_id", UUID::class.java),
                        subjectName = row.getString("subject_name"),
                        lastObservedAt = row.instant("last_observed_at"),
                    ),
                    row.getLong("risk_count"),
                )
            }
            .list()
        return Risks(rows.firstOrNull()?.total ?: 0, rows.map { it.fact })
    }

    private fun scopedQuery(sql: String, viewer: String, companyId: UUID?, days: Int): JdbcClient.StatementSpec =
        jdbc.sql(sql).param("viewer", viewer).param("companyId", companyId, Types.OTHER).param("days", days)

    private fun ResultSet.instant(column: String): Instant? =
        getObject(column, OffsetDateTime::class.java)?.toInstant()

    private data class Totals(
        val companies: Long,
        val contacts: Long,
        val interactions: Long,
        val earliestAsOf: Instant?,
        val latestAsOf: Instant?,
    )

    private data class CompanyRow(val name: String, val contacts: Long, val initiative: InitiativeActivity?)
    private data class RiskRow(val fact: RiskFact, val total: Long)
    private data class Risks(val total: Long, val facts: List<RiskFact>)

    private companion object {
        const val VERIFICATION_DAYS = 90
        const val PORTFOLIO_RISK_LIMIT = 8

        const val SCOPE = """
            visible_companies AS (
                SELECT c.id, c.name
                FROM company_viewers v
                JOIN companies c ON c.id = v.company_id
                WHERE v.viewer_key = :viewer AND (CAST(:companyId AS uuid) IS NULL OR c.id = :companyId)
            ),
            initiative_scope AS (
                SELECT i.id, i.company_id, i.name, i.as_of,
                       i.as_of - make_interval(hours => :days * 24) AS window_start,
                       i.as_of - make_interval(hours => $VERIFICATION_DAYS * 24) AS verification_start
                FROM visible_companies c
                JOIN initiatives i ON i.company_id = c.id
            )
        """

        const val INITIATIVE_ACTIVITY = """
            initiative_activity AS (
                SELECT i.id, i.company_id, i.name, i.as_of, count(t.id) AS active_interaction_count
                FROM initiative_scope i
                LEFT JOIN touchpoints t ON t.initiative_id = i.id
                    AND t.occurred_at > i.window_start AND t.occurred_at <= i.as_of
                GROUP BY i.id, i.company_id, i.name, i.as_of
            )
        """

        const val DASHBOARD_SQL = """
            WITH $SCOPE, $INITIATIVE_ACTIVITY
            SELECT (SELECT count(*) FROM visible_companies) AS company_count,
                   (SELECT count(*) FROM visible_companies c
                    JOIN contacts p ON p.company_id = c.id) AS registered_contact_count,
                   coalesce(sum(active_interaction_count), 0) AS active_interaction_count,
                   min(as_of) AS earliest_as_of, max(as_of) AS latest_as_of
            FROM initiative_activity
        """

        const val COMPANY_SQL = """
            WITH $SCOPE, $INITIATIVE_ACTIVITY,
            contact_count AS (
                SELECT count(*) AS registered_contact_count
                FROM visible_companies c
                JOIN contacts p ON p.company_id = c.id
            )
            SELECT c.name AS company_name, n.registered_contact_count,
                   i.id AS initiative_id, i.name AS initiative_name, i.as_of, i.active_interaction_count
            FROM visible_companies c
            CROSS JOIN contact_count n
            LEFT JOIN initiative_activity i ON i.company_id = c.id
            ORDER BY i.id
        """

        const val RISKS_SQL = """
            WITH $SCOPE,
            last_touch AS (
                SELECT i.id AS initiative_id, p.contact_id, max(t.occurred_at) AS touched_at
                FROM initiative_scope i
                JOIN touchpoints t ON t.initiative_id = i.id AND t.occurred_at <= i.as_of
                JOIN touchpoint_participants p ON p.initiative_id = i.id AND p.touchpoint_id = t.id
                GROUP BY i.id, p.contact_id
            ),
            contact_evidence AS (
                SELECT i.id AS initiative_id, i.window_start, i.verification_start,
                       c.id, c.company_id, c.name, c.department_id, p.decision_maker, t.touched_at,
                       CASE WHEN c.verified_at <= i.as_of THEN c.verified_at END AS verified_at
                FROM initiative_scope i
                JOIN initiative_participants p ON p.initiative_id = i.id AND p.company_id = i.company_id
                JOIN contacts c ON c.id = p.contact_id AND c.company_id = i.company_id
                LEFT JOIN last_touch t ON t.initiative_id = i.id AND t.contact_id = c.id
            ),
            department_gaps AS (
                SELECT e.initiative_id, d.id, d.name, max(e.touched_at) AS touched_at
                FROM contact_evidence e
                JOIN departments d ON d.id = e.department_id AND d.company_id = e.company_id
                GROUP BY e.initiative_id, d.id, d.name, e.window_start
                HAVING max(e.touched_at) IS NULL OR max(e.touched_at) <= e.window_start
            ),
            concentrated_initiatives AS (
                SELECT initiative_id
                FROM contact_evidence
                WHERE decision_maker
                GROUP BY initiative_id
                HAVING count(*) > 1 AND count(*) FILTER (WHERE touched_at > window_start) = 1
            ),
            risk_facts AS (
                SELECT initiative_id, id AS subject_id, name AS subject_name, 1 AS priority,
                       'UNCONTACTED_DECISION_MAKER' AS code, 'NO_EVIDENCE' AS evidence_status,
                       touched_at AS last_observed_at
                FROM contact_evidence
                WHERE decision_maker AND touched_at IS NULL

                UNION ALL
                SELECT e.initiative_id, e.id, e.name, 2, 'SINGLE_ENGAGED_DECISION_MAKER', 'RECORDED', e.touched_at
                FROM contact_evidence e
                JOIN concentrated_initiatives i ON i.initiative_id = e.initiative_id
                WHERE e.decision_maker AND e.touched_at > e.window_start

                UNION ALL
                SELECT initiative_id, id, name, 3, 'UNCONTACTED_DEPARTMENT',
                       CASE WHEN touched_at IS NULL THEN 'NO_EVIDENCE' ELSE 'STALE' END, touched_at
                FROM department_gaps

                UNION ALL
                SELECT initiative_id, id, name, 4, 'STALE_CONTACT_VERIFICATION', 'STALE', verified_at
                FROM contact_evidence
                WHERE verified_at <= verification_start

                UNION ALL
                SELECT initiative_id, id, name, 5, 'UNKNOWN_CONTACT_VERIFICATION', 'NO_EVIDENCE', verified_at
                FROM contact_evidence
                WHERE verified_at IS NULL
            )
            SELECT f.code, f.evidence_status, c.id AS company_id, c.name AS company_name,
                   i.id AS initiative_id, i.name AS initiative_name, i.as_of,
                   f.subject_id, f.subject_name, f.last_observed_at, count(*) OVER () AS risk_count
            FROM risk_facts f
            JOIN initiative_scope i ON i.id = f.initiative_id
            JOIN visible_companies c ON c.id = i.company_id
            ORDER BY f.priority, c.id, i.id, f.subject_id
            LIMIT :limit
        """
    }
}
