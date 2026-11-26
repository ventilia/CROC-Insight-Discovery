package ru.croc.insight.dashboard

import java.time.Instant
import java.util.UUID

data class DashboardResponse(
    val days: Int,
    val verificationDays: Int,
    val accessibleCompanyCount: Long,
    val registeredContactCount: Long,
    val activeInteractionCount: Long,
    val earliestAsOf: Instant?,
    val latestAsOf: Instant?,
    val riskCount: Long,
    val risks: List<RiskFact>,
    val companies: List<DashboardCompany>,
    val recentInteractions: List<DashboardInteraction>,
)

data class DashboardCompany(
    val companyId: UUID,
    val initiativeCount: Long,
    val contactCount: Long,
    val departmentCount: Long,
    val latestAsOf: Instant?,
)

data class DashboardInteraction(
    val id: UUID,
    val initiativeId: UUID,
    val initiativeName: String,
    val type: String,
    val occurredAt: Instant,
    val subject: String,
    val team: String,
)

data class CompanyInsightsResponse(
    val companyId: UUID,
    val companyName: String,
    val days: Int,
    val verificationDays: Int,
    val registeredContactCount: Long,
    val activeInteractionCount: Long,
    val earliestAsOf: Instant?,
    val latestAsOf: Instant?,
    val initiatives: List<InitiativeActivity>,
    val riskCount: Long,
    val risks: List<RiskFact>,
)

data class InitiativeActivity(
    val initiativeId: UUID,
    val initiativeName: String,
    val asOf: Instant,
    val activeInteractionCount: Long,
)

enum class RiskCode {
    UNCONTACTED_DEPARTMENT,
    UNCONTACTED_DECISION_MAKER,
    SINGLE_ENGAGED_DECISION_MAKER,
    STALE_CONTACT_VERIFICATION,
    UNKNOWN_CONTACT_VERIFICATION,
}

enum class EvidenceStatus { NO_EVIDENCE, STALE, RECORDED }

data class RiskFact(
    val code: RiskCode,
    val evidenceStatus: EvidenceStatus,
    val companyId: UUID,
    val companyName: String,
    val initiativeId: UUID,
    val initiativeName: String,
    val asOf: Instant,
    val subjectId: UUID,
    val subjectName: String,
    val lastObservedAt: Instant?,
)
