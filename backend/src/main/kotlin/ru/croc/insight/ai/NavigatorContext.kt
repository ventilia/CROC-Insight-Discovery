package ru.croc.insight.ai

import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.dashboard.DashboardService
import ru.croc.insight.dashboard.InitiativeActivity
import ru.croc.insight.dashboard.RiskCode
import ru.croc.insight.history.CoverageService
import ru.croc.insight.history.Recency
import ru.croc.insight.history.TouchpointService
import ru.croc.insight.history.relationshipHealth
import ru.croc.insight.map.GraphService
import ru.croc.insight.source.PositionService

data class NavigatorSource(val ref: String, val label: String, val kind: String, val id: UUID, val initiativeId: UUID? = null)

data class NavigatorSnapshot(
    val asOf: Instant?,
    val facts: Map<String, Any?>,
    val sources: Map<String, NavigatorSource>,
)

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
class NavigatorContext(
    private val catalog: CatalogService,
    private val coverage: CoverageService,
    private val touchpoints: TouchpointService,
    private val dashboard: DashboardService,
    private val graphs: GraphService,
    private val positions: PositionService,
) {
    fun initiative(viewer: String, initiativeId: UUID, days: Int, external: Boolean): NavigatorSnapshot? {
        val project = catalog.findInitiative(viewer, initiativeId) ?: return null
        val snapshot = coverage.find(viewer, initiativeId, days) ?: return null
        val history = touchpoints.history(viewer, initiativeId, null, MAX_EVENTS, null, snapshot.asOf) ?: return null
        val graph = graphs.findGraph(viewer, initiativeId, null, null) ?: return null
        val nodes = graph.nodes.associateBy { it.id }
        val health = snapshot.relationshipHealth()
        val refs = References(external)
        val projectRef = refs.project(project.id, project.name)
        val departments = snapshot.departments.sortedWith(compareBy(
            { it.touchStatus == Recency.RECENT }, { it.lastTouchAt }, { it.id },
        )).take(MAX_DEPARTMENTS)
        val departmentRefs = departments.associate { it.id to refs.department(it.id, it.name) }
        val prioritized = snapshot.contacts.sortedWith(compareBy(
            { !it.decisionMaker },
            { it.touchStatus == Recency.RECENT },
            { it.verificationStatus == Recency.RECENT },
            { it.lastTouchAt },
            { it.id },
        ))
        val anchors = prioritized.filter {
            it.touchStatus == Recency.RECENT && it.verificationStatus == Recency.RECENT
        }.take(3)
        val selected = (prioritized.take(MAX_CONTACTS - anchors.size) + anchors + prioritized).distinctBy { it.id }.take(MAX_CONTACTS)
        val recordedPositions = positions.currentForContacts(project.id, selected.map { it.id })
        val contactRefs = selected.associate { it.id to refs.contact(it.id, it.name, project.id) }
        val cutoff = snapshot.asOf.minus(Duration.ofDays(days.toLong()))
        val confirmedLinks = graph.edges.asSequence().filter {
            it.confirmed && it.source in contactRefs && it.target in contactRefs
        }.sortedWith(compareBy(
            { nodes[it.target]?.decisionMaker != true }, { it.type != "APPROVAL" }, { it.id },
        )).take(MAX_LINKS)

        return NavigatorSnapshot(snapshot.asOf, mapOf(
            "scope" to "INITIATIVE",
            "asOf" to snapshot.asOf.toString(),
            "days" to snapshot.days,
            "verificationDays" to snapshot.verificationDays,
            "project" to buildMap {
                putAll(refs.describe(projectRef))
                put("due", project.due?.toString())
                put("nextStepRecorded", !project.nextStep.isNullOrBlank())
                if (!external) {
                    put("stage", project.stage?.take(100))
                    put("owner", project.owner?.take(160))
                    put("nextStep", project.nextStep?.take(300))
                }
            },
            "coverage" to mapOf(
                "status" to health.status,
                "score" to health.score,
                "participantCount" to snapshot.contacts.size,
                "departmentCount" to snapshot.departments.size,
                "decisionMakerTouches" to health.decisionMakerTouches,
                "departmentTouches" to health.departmentTouches,
                "decisionMakerVerification" to health.decisionMakerVerification,
                "contactsWithoutTouchpoints" to health.contactsWithoutTouchpoints,
                "contactsWithoutDepartment" to health.contactsWithoutDepartment,
                "singleEngagedDecisionMaker" to (health.decisionMakerTouches.total > 1 && health.decisionMakerTouches.recent == 1),
            ),
            "contacts" to selected.map { contact ->
                val node = nodes[contact.id]
                val role = node?.role
                buildMap {
                    putAll(refs.describe(contactRefs.getValue(contact.id)))
                    put("departmentRef", contact.department?.id?.let(departmentRefs::get))
                    put("decisionMaker", contact.decisionMaker)
                    put("roleCode", role?.code?.let { if (it in ROLE_CODES) it else "OTHER" })
                    put("influence", node?.influence?.takeIf { it in INFLUENCE_LEVELS })
                    put("lastTouchAt", contact.lastTouchAt?.toString())
                    put("touchStatus", contact.touchStatus)
                    put("lastVerifiedAt", contact.lastVerifiedAt?.toString())
                    put("verificationStatus", contact.verificationStatus)
                    val position = recordedPositions[contact.id]
                    put("recordedPosition", position?.let {
                        buildMap {
                            put("stance", it.stance)
                            put("recordedAt", it.changedAt.toString())
                            if (!external) put("basis", it.basis.take(240))
                        }
                    })
                    if (!external) {
                        put("jobTitle", contact.jobTitle?.take(120))
                        put("roleLabel", role?.label?.take(120))
                        put("recordedInterest", node?.interest?.take(200))
                        put("mandate", node?.mandate?.take(160))
                    }
                }
            },
            "departments" to departments.map { department ->
                refs.describe(departmentRefs.getValue(department.id)) + mapOf(
                    "touchStatus" to department.touchStatus,
                    "lastTouchAt" to department.lastTouchAt?.toString(),
                    "recentCount" to department.recentCount,
                    "participantCount" to department.participantCount,
                )
            },
            "recentInteractions" to history.items.mapIndexed { index, event ->
                buildMap {
                    put("ref", "E${index + 1}")
                    put("type", event.type.takeIf { it in INTERACTION_TYPES } ?: "OTHER")
                    put("occurredAt", event.occurredAt.toString())
                    put("inWindow", event.occurredAt > cutoff)
                    put("contactRefs", event.participants.mapNotNull { contactRefs[it.id] }.take(MAX_EVENT_CONTACTS))
                    put("nextStepRecorded", !event.nextStep.isNullOrBlank())
                    if (!external) {
                        put("subject", event.subject.take(160))
                        put("outcome", event.outcome?.take(240))
                        put("nextStep", event.nextStep?.take(240))
                    }
                }
            },
            "confirmedLinks" to confirmedLinks.mapIndexed { index, link ->
                buildMap {
                    put("ref", "L${index + 1}")
                    put("sourceRef", contactRefs.getValue(link.source))
                    put("targetRef", contactRefs.getValue(link.target))
                    put("type", link.type.takeIf { it in LINK_TYPES } ?: "OTHER")
                    if (!external) put("label", link.label.take(160))
                }
            }.toList(),
        ), refs.sources())
    }

    fun company(viewer: String, companyId: UUID, days: Int, external: Boolean): NavigatorSnapshot? {
        val snapshot = dashboard.companyInsights(viewer, companyId, days, MAX_RISKS) ?: return null
        val refs = References(external)
        val companyRef = refs.company(companyId, snapshot.companyName)
        val risksByProject = snapshot.risks.groupingBy { it.initiativeId }.eachCount()
        val projects = snapshot.initiatives.sortedWith(compareByDescending<InitiativeActivity> {
            risksByProject[it.initiativeId] ?: 0
        }.thenByDescending { it.activeInteractionCount }.thenBy { it.initiativeId })
        return NavigatorSnapshot(snapshot.latestAsOf, mapOf(
            "scope" to "COMPANY",
            "company" to refs.describe(companyRef),
            "days" to snapshot.days,
            "verificationDays" to snapshot.verificationDays,
            "earliestAsOf" to snapshot.earliestAsOf?.toString(),
            "latestAsOf" to snapshot.latestAsOf?.toString(),
            "registeredContactCount" to snapshot.registeredContactCount,
            "activeInteractionCount" to snapshot.activeInteractionCount,
            "projectCount" to projects.size,
            "projects" to projects.take(MAX_PROJECTS).map {
                refs.describe(refs.project(it.initiativeId, it.initiativeName)) + mapOf(
                    "activeInteractionCount" to it.activeInteractionCount,
                    "asOf" to it.asOf.toString(),
                    "riskExamples" to (risksByProject[it.initiativeId] ?: 0),
                )
            },
            "riskCount" to snapshot.riskCount,
            "risks" to snapshot.risks.map {
                val subject = if (it.code == RiskCode.UNCONTACTED_DEPARTMENT) refs.department(it.subjectId, it.subjectName)
                    else refs.contact(it.subjectId, it.subjectName)
                mapOf(
                    "code" to it.code,
                    "evidenceStatus" to it.evidenceStatus,
                    "project" to refs.describe(refs.project(it.initiativeId, it.initiativeName)),
                    "subject" to refs.describe(subject),
                    "lastObservedAt" to it.lastObservedAt?.toString(),
                    "asOf" to it.asOf.toString(),
                )
            },
        ), refs.sources())
    }

    private class References(private val external: Boolean) {
        private val byCategory = mutableMapOf<String, MutableMap<UUID, String>>()
        private val sources = mutableMapOf<String, NavigatorSource>()

        fun company(id: UUID, name: String) = reference("O", id, name, "COMPANY")
        fun project(id: UUID, name: String) = reference("P", id, name, "PROJECT", id)
        fun department(id: UUID, name: String) = reference("D", id, name, "DEPARTMENT")
        fun contact(id: UUID, name: String, initiativeId: UUID? = null) = reference("C", id, name, "CONTACT", initiativeId)

        fun describe(ref: String) = if (external) mapOf("ref" to ref) else mapOf("ref" to ref, "name" to sources.getValue(ref).label)
        fun sources(): Map<String, NavigatorSource> = sources

        private fun reference(category: String, id: UUID, name: String, kind: String, initiativeId: UUID? = null): String {
            val references = byCategory.getOrPut(category) { mutableMapOf() }
            return references.getOrPut(id) {
                "$category${references.size + 1}".also { sources[it] = NavigatorSource(it, name.take(160), kind, id, initiativeId) }
            }
        }
    }

    private companion object {
        const val MAX_CONTACTS = 16
        const val MAX_DEPARTMENTS = 16
        const val MAX_EVENTS = 5
        const val MAX_EVENT_CONTACTS = 8
        const val MAX_LINKS = 8
        const val MAX_PROJECTS = 12
        const val MAX_RISKS = 18
        val INTERACTION_TYPES = setOf("MEETING", "CALL", "EMAIL", "NOTE", "PROPOSAL")
        val LINK_TYPES = setOf("APPROVAL", "COORDINATION", "EXPERTISE")
        val ROLE_CODES = setOf("BUDGET_APPROVER", "PROJECT_SPONSOR", "TECHNICAL_EXPERT", "CONSULTANT", "PROCUREMENT_LEAD")
        val INFLUENCE_LEVELS = setOf("HIGH", "MEDIUM", "LOW")
    }
}
