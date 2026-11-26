package ru.croc.insight.map

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import ru.croc.insight.catalog.CatalogService

@Service
class GraphService(
    private val catalog: CatalogService,
    private val participants: ParticipantService,
    private val jdbc: JdbcClient,
) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun findGraph(viewer: String, initiativeId: UUID, roleCode: String?, departmentId: UUID?): Graph? {
        val initiative = catalog.findInitiative(viewer, initiativeId) ?: return null
        val allNodes = participants.list(initiative.id)
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

    private fun edges(initiativeId: UUID): List<GraphEdge> =
        jdbc.sql(
            """
            SELECT id, source_contact_id, target_contact_id, type, label, confirmed, source_label
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
                    sourceLabel = row.getString("source_label"),
                )
            }
            .list()
}
