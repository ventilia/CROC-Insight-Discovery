package ru.croc.insight.map

import java.time.Instant
import java.util.UUID

data class Graph(
    val companyId: UUID,
    val initiativeId: UUID,
    val asOf: Instant,
    val nodes: List<GraphNode>,
    val edges: List<GraphEdge>,
    val filters: GraphFilters,
) {
    val matchingPeople: Int get() = nodes.size
}

data class GraphNode(
    val id: UUID,
    val name: String,
    val jobTitle: String?,
    val department: Department?,
    val role: ParticipantRole?,
    val decisionMaker: Boolean,
)

data class GraphEdge(
    val id: UUID,
    val source: UUID,
    val target: UUID,
    val type: String,
    val label: String,
    val confirmed: Boolean,
)

data class GraphFilters(val departments: List<Department>, val roles: List<ParticipantRole>)

data class Department(val id: UUID, val name: String)

data class ParticipantRole(val code: String, val label: String)
