package ru.croc.insight.map

import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.source.PositionRevision
import ru.croc.insight.source.PositionService

data class PersonDossier(
    val companyId: UUID,
    val initiativeId: UUID,
    val asOf: Instant,
    val person: GraphNode,
    val position: PositionRevision?,
)

@Service
class ParticipantService(private val catalog: CatalogService, private val positions: PositionService, private val jdbc: JdbcClient) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun findDossier(viewer: String, initiativeId: UUID, personId: UUID): PersonDossier? {
        val initiative = catalog.findInitiative(viewer, initiativeId) ?: return null
        val person = queryParticipants(initiative.id, personId).optional().orElse(null) ?: return null
        return PersonDossier(initiative.companyId, initiative.id, initiative.asOf, person, positions.current(initiativeId, personId))
    }

    internal fun list(initiativeId: UUID): List<GraphNode> = queryParticipants(initiativeId, null).list()

    internal fun exists(initiativeId: UUID, personId: UUID): Boolean =
        jdbc.sql(
            """
            SELECT EXISTS (
                SELECT 1 FROM initiative_participants
                WHERE initiative_id = :initiativeId AND contact_id = :personId
            )
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("personId", personId)
            .query(Boolean::class.javaObjectType)
            .single()

    private fun queryParticipants(initiativeId: UUID, personId: UUID?): JdbcClient.MappedQuerySpec<GraphNode> =
        jdbc.sql(
            """
            SELECT c.id, c.name, c.job_title, d.id AS department_id, d.name AS department_name,
                   r.code AS role_code, r.label AS role_label, p.decision_maker,
                   p.influence, p.influence_basis, c.email, c.phone
            FROM initiative_participants p
            JOIN contacts c ON c.id = p.contact_id
            LEFT JOIN departments d ON d.id = c.department_id
            LEFT JOIN participant_roles r ON r.code = p.role_code
            WHERE p.initiative_id = :initiativeId
              AND (CAST(:personId AS uuid) IS NULL OR p.contact_id = :personId)
            ORDER BY c.id
            """.trimIndent(),
        )
            .param("initiativeId", initiativeId)
            .param("personId", personId)
            .query { row, _ ->
                GraphNode(
                    id = row.getObject("id", UUID::class.java),
                    name = row.getString("name"),
                    jobTitle = row.getString("job_title"),
                    department = row.getObject("department_id", UUID::class.java)
                        ?.let { Department(it, row.getString("department_name")) },
                    role = row.getString("role_code")?.let { ParticipantRole(it, row.getString("role_label")) },
                    decisionMaker = row.getBoolean("decision_maker"),
                    influence = row.getString("influence"),
                    influenceBasis = row.getString("influence_basis"),
                    email = row.getString("email"),
                    phone = row.getString("phone"),
                )
            }
}
