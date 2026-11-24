package ru.croc.insight.map

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import ru.croc.insight.catalog.CatalogService

@Service
class GraphService(private val catalog: CatalogService, private val jdbc: JdbcClient) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun findGraph(viewer: String, initiativeId: UUID, roleCode: String?, departmentId: UUID?): Graph? {
        val initiative = catalog.findInitiative(viewer, initiativeId) ?: return null
        val allNodes = nodes(initiative.id)
        val visibleNodes = allNodes.filter { node ->
            (roleCode == null || node.role?.code == roleCode) &&
                (departmentId == null || node.department?.id == departmentId)
        }
        val visibleIds = visibleNodes.mapTo(mutableSetOf()) { it.id }
        val visibleEdges = edges(initiative.id).filter { it.source in visibleIds && it.target in visibleIds }

        return Graph(
            companyId = initiative.companyId,
            initiativeId = initiative.id,
            asOf = initiative.asOf,
            nodes = visibleNodes,
            edges = visibleEdges,
            filters = GraphFilters(
                departments = allNodes.mapNotNull { it.department }.distinctBy { it.id }.sortedBy { it.name },
                roles = allNodes.mapNotNull { it.role }.distinctBy { it.code }.sortedBy { it.label },
            ),
        )
    }

    private fun nodes(initiativeId: UUID): List<GraphNode> =
        jdbc.sql(
            """
            SELECT c.id, c.name, c.job_title, d.id AS department_id, d.name AS department_name,
                   r.code AS role_code, r.label AS role_label, p.decision_maker
            FROM initiative_participants p
            JOIN contacts c ON c.id = p.contact_id
            LEFT JOIN departments d ON d.id = c.department_id
            LEFT JOIN participant_roles r ON r.code = p.role_code
            WHERE p.initiative_id = :initiativeId
            ORDER BY c.id
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .query { row, _ ->
                GraphNode(
                    id = row.getObject("id", UUID::class.java),
                    name = row.getString("name"),
                    jobTitle = row.getString("job_title"),
                    department = row.getObject("department_id", UUID::class.java)
                        ?.let { Department(it, row.getString("department_name")) },
                    role = row.getString("role_code")?.let { ParticipantRole(it, row.getString("role_label")) },
                    decisionMaker = row.getBoolean("decision_maker"),
                )
            }
            .list()

    private fun edges(initiativeId: UUID): List<GraphEdge> =
        jdbc.sql(
            """
            SELECT id, source_contact_id, target_contact_id, type, label, confirmed
            FROM relationships
            WHERE initiative_id = :initiativeId
            ORDER BY id
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .query { row, _ ->
                GraphEdge(
                    id = row.getObject("id", UUID::class.java),
                    source = row.getObject("source_contact_id", UUID::class.java),
                    target = row.getObject("target_contact_id", UUID::class.java),
                    type = row.getString("type"),
                    label = row.getString("label"),
                    confirmed = row.getBoolean("confirmed"),
                )
            }
            .list()
}
