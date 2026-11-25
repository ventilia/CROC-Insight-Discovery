package ru.croc.insight.history

import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt

enum class HealthStatus { READY, PARTIAL, INSUFFICIENT_DATA }

data class HealthFactor(val total: Int, val recent: Int, val unknown: Int, val weight: Int)

data class RelationshipHealth(
    val initiativeId: UUID,
    val asOf: Instant,
    val days: Int,
    val verificationDays: Int,
    val status: HealthStatus,
    val score: Int?,
    val decisionMakerTouches: HealthFactor,
    val departmentTouches: HealthFactor,
    val decisionMakerVerification: HealthFactor,
    val contactsWithoutTouchpoints: Int,
    val contactsWithoutDepartment: Int,
)

internal fun Coverage.relationshipHealth(): RelationshipHealth {
    val decisionMakers = contacts.filter { it.decisionMaker }
    val decisionMakerTouches = factor(decisionMakers.map { it.touchStatus }, 50)
    val departmentTouches = factor(departments.map { it.touchStatus }, 30)
    val decisionMakerVerification = factor(decisionMakers.map { it.verificationStatus }, 20)
    val factors = listOf(decisionMakerTouches, departmentTouches, decisionMakerVerification)
    val withoutTouchpoints = contacts.count { it.touchStatus == Recency.UNKNOWN }
    val withoutDepartment = contacts.count { it.department == null }
    val status = when {
        factors.any { it.total == it.unknown } -> HealthStatus.INSUFFICIENT_DATA
        factors.any { it.unknown > 0 } || withoutTouchpoints > 0 || withoutDepartment > 0 -> HealthStatus.PARTIAL
        else -> HealthStatus.READY
    }
    val score = if (status == HealthStatus.INSUFFICIENT_DATA) null
        else factors.sumOf { it.weight * it.recent.toDouble() / it.total }.roundToInt()
    return RelationshipHealth(
        initiativeId, asOf, days, verificationDays, status, score,
        decisionMakerTouches, departmentTouches, decisionMakerVerification, withoutTouchpoints, withoutDepartment,
    )
}

private fun factor(observations: List<Recency>, weight: Int) = HealthFactor(
    observations.size,
    observations.count { it == Recency.RECENT },
    observations.count { it == Recency.UNKNOWN },
    weight,
)
