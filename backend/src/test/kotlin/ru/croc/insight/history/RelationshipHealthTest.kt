package ru.croc.insight.history

import java.time.Instant
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import ru.croc.insight.map.Department

class RelationshipHealthTest {
    @Test
    fun `missing history does not produce a zero score`() {
        val health = coverage(Recency.UNKNOWN, Recency.RECENT).relationshipHealth()

        assertThat(health.status).isEqualTo(HealthStatus.INSUFFICIENT_DATA)
        assertThat(health.score).isNull()
        assertThat(health.decisionMakerTouches.unknown).isEqualTo(1)
    }

    @Test
    fun `known stale data can produce a real zero`() {
        val health = coverage(Recency.STALE, Recency.STALE).relationshipHealth()

        assertThat(health.status).isEqualTo(HealthStatus.READY)
        assertThat(health.score).isZero()
        assertThat(health.decisionMakerTouches.unknown).isZero()
    }

    private fun coverage(touch: Recency, verification: Recency): Coverage {
        val department = Department(UUID.randomUUID(), "ИТ")
        val recorded = Instant.parse("2026-07-01T09:00:00Z")
        val verifiedAt = if (verification == Recency.RECENT) Instant.parse("2026-11-20T09:00:00Z") else recorded
        val touchAt = recorded.takeUnless { touch == Recency.UNKNOWN }
        return Coverage(
            UUID.randomUUID(), Instant.parse("2026-11-24T09:00:00Z"), 7, 90,
            listOf(ContactCoverage(UUID.randomUUID(), "Тестовый участник", null, department, true,
                touchAt, touch, verifiedAt, verification)),
            listOf(DepartmentCoverage(department.id, department.name, 1, 0, touchAt, touch)),
        )
    }
}
