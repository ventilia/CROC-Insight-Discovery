package ru.croc.insight.directory

import com.fasterxml.jackson.annotation.JsonUnwrapped
import java.time.Instant
import java.util.UUID
import ru.croc.insight.catalog.InitiativeSummary
import ru.croc.insight.history.Recency
import ru.croc.insight.map.Department
import ru.croc.insight.map.GraphFilters
import ru.croc.insight.map.ParticipantRole

enum class Influence { UNKNOWN, LOW, MEDIUM, HIGH }

enum class ConnectionDirection { INCOMING, OUTGOING }

data class CompanyProfile(
    val id: UUID,
    val name: String,
    val industry: String?,
    val description: String?,
    val departments: List<Department>,
    val initiatives: List<InitiativeSummary>,
    val contactCount: Long,
    val keyContacts: List<ContactSummary>,
    val roles: List<ParticipantRole>,
)

data class ContactSummary(
    val id: UUID,
    val name: String,
    val jobTitle: String?,
    val department: Department?,
    val roles: List<ParticipantRole>,
    val influence: Influence,
    val decisionMaker: Boolean,
    val lastInteractionAt: Instant?,
    val interaction: Recency,
    val responsibleManager: String?,
)

data class ContactPage(val items: List<ContactSummary>, val total: Long, val limit: Int, val offset: Int)

data class ContactProfile(
    val companyId: UUID,
    @get:JsonUnwrapped val summary: ContactSummary,
    val email: String?,
    val phone: String?,
    val assignments: List<ContactAssignment>,
    val connections: List<ContactConnection>,
)

data class ContactAssignment(
    val initiativeId: UUID,
    val initiativeName: String,
    val asOf: Instant,
    val role: ParticipantRole?,
    val decisionMaker: Boolean,
    val influence: Influence,
    val influenceBasis: String?,
)

data class ContactConnection(
    val id: UUID,
    val contactId: UUID,
    val name: String,
    val initiativeId: UUID,
    val initiativeName: String,
    val direction: ConnectionDirection,
    val type: String,
    val label: String,
    val confirmed: Boolean,
)

data class CompanyGraph(
    val companyId: UUID,
    val nodes: List<ContactSummary>,
    val edges: List<CompanyGraphEdge>,
    val filters: GraphFilters,
) {
    val matchingPeople: Int get() = nodes.size
}

data class CompanyGraphEdge(
    val id: UUID,
    val initiativeId: UUID,
    val initiativeName: String,
    val source: UUID,
    val target: UUID,
    val type: String,
    val label: String,
    val confirmed: Boolean,
)
