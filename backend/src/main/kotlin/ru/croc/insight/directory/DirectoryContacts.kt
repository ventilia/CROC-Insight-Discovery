package ru.croc.insight.directory

import java.sql.ResultSet
import java.sql.Types
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import ru.croc.insight.history.Recency
import ru.croc.insight.map.Department
import ru.croc.insight.map.ParticipantRole

@Repository
class DirectoryContacts(private val jdbc: JdbcClient) {
    internal fun count(companyId: UUID, filters: DirectoryFilters = DirectoryFilters()): Long =
        matching(companyId, filters, "count(*)").query(Long::class.javaObjectType).single()

    internal fun list(
        companyId: UUID,
        filters: DirectoryFilters = DirectoryFilters(),
        limit: Int? = null,
        offset: Int = 0,
        keyOnly: Boolean = false,
    ): List<DirectoryContactRow> = matching(
        companyId, filters, CONTACT_COLUMNS, keyOnly = keyOnly,
        tail = "ORDER BY lower(c.name), c.id LIMIT :limit OFFSET :offset",
    )
        .param("limit", limit, Types.INTEGER)
        .param("offset", offset)
        .query { row, _ -> contact(row) }
        .list()

    internal fun find(companyId: UUID, contactId: UUID): DirectoryContactRow? =
        matching(companyId, DirectoryFilters(), CONTACT_COLUMNS, contactId = contactId)
            .query { row, _ -> contact(row) }
            .optional().orElse(null)

    internal fun assignments(companyId: UUID, contactIds: List<UUID>? = null): Map<UUID, List<ContactAssignment>> {
        if (contactIds?.isEmpty() == true) return emptyMap()
        val query = jdbc.sql(
            """
            SELECT p.contact_id, i.id AS initiative_id, i.name AS initiative_name, i.as_of,
                   p.decision_maker, p.influence, p.influence_basis, r.code AS role_code, r.label AS role_label
            FROM initiative_participants p
            JOIN initiatives i ON i.company_id = p.company_id AND i.id = p.initiative_id
            LEFT JOIN participant_roles r ON r.code = p.role_code
            WHERE p.company_id = :companyId
            ${if (contactIds != null) "AND p.contact_id IN (:contactIds)" else ""}
            ORDER BY i.id
            """.trimIndent(),
        ).param("companyId", companyId)
        if (contactIds != null) query.param("contactIds", contactIds)
        return query.query { row, _ ->
            row.getObject("contact_id", UUID::class.java) to ContactAssignment(
                initiativeId = row.getObject("initiative_id", UUID::class.java),
                initiativeName = row.getString("initiative_name"),
                asOf = row.getObject("as_of", OffsetDateTime::class.java).toInstant(),
                role = row.getString("role_code")?.let { ParticipantRole(it, row.getString("role_label")) },
                decisionMaker = row.getBoolean("decision_maker"),
                influence = row.getString("influence")?.let(Influence::valueOf) ?: Influence.UNKNOWN,
                influenceBasis = row.getString("influence_basis"),
            )
        }.list().groupBy({ it.first }, { it.second })
    }

    private fun matching(
        companyId: UUID,
        filters: DirectoryFilters,
        columns: String,
        contactId: UUID? = null,
        keyOnly: Boolean = false,
        tail: String = "",
    ): JdbcClient.StatementSpec = jdbc.sql(
        """
        SELECT $columns
        FROM contacts c
        LEFT JOIN departments d ON d.company_id = c.company_id AND d.id = c.department_id
        LEFT JOIN LATERAL (
            SELECT t.occurred_at, t.responsible_manager,
                   CASE WHEN t.occurred_at <= i.as_of - :days * interval '24 hours'
                        THEN 'STALE' ELSE 'RECENT' END AS interaction
            $ELIGIBLE_TOUCHES
            ORDER BY t.occurred_at DESC, t.id DESC
            LIMIT 1
        ) latest ON true
        WHERE c.company_id = :companyId
          AND (CAST(:contactId AS uuid) IS NULL OR c.id = :contactId)
          AND (CAST(:departmentId AS uuid) IS NULL OR c.department_id = :departmentId)
          AND (:q IS NULL OR strpos(lower(c.name), lower(:q)) > 0
                          OR strpos(lower(c.job_title), lower(:q)) > 0
                          OR strpos(lower(d.name), lower(:q)) > 0)
          AND (:jobTitle IS NULL OR strpos(lower(c.job_title), lower(:jobTitle)) > 0)
          AND (:decisionMaker IS NULL OR :decisionMaker = EXISTS (
              SELECT 1 FROM initiative_participants p
              WHERE p.company_id = c.company_id AND p.contact_id = c.id AND p.decision_maker
          ))
          AND (:interaction IS NULL OR coalesce(latest.interaction, 'UNKNOWN') = :interaction)
          AND (:responsibleManager IS NULL OR EXISTS (
              SELECT 1
              $ELIGIBLE_TOUCHES
                AND strpos(lower(t.responsible_manager), lower(:responsibleManager)) > 0
          ))
          AND (NOT :keyOnly OR EXISTS (
              SELECT 1 FROM initiative_participants p
              WHERE p.company_id = c.company_id AND p.contact_id = c.id
                AND (p.decision_maker OR p.influence = 'HIGH')
          ))
          AND (
              (:roleCode IS NULL AND :influence IS NULL)
              OR EXISTS (
                  SELECT 1 FROM initiative_participants p
                  WHERE p.company_id = c.company_id AND p.contact_id = c.id
                    AND (:roleCode IS NULL OR p.role_code = :roleCode)
                    AND (:influence IS NULL OR coalesce(p.influence, 'UNKNOWN') = :influence)
              )
              OR (:roleCode IS NULL AND :influence = 'UNKNOWN' AND NOT EXISTS (
                  SELECT 1 FROM initiative_participants p
                  WHERE p.company_id = c.company_id AND p.contact_id = c.id
              ))
          )
        $tail
        """.trimIndent(),
    )
        .param("companyId", companyId)
        .param("contactId", contactId)
        .param("departmentId", filters.departmentId?.let(UUID::fromString))
        .param("q", filters.q?.trim()?.takeIf(String::isNotEmpty), Types.VARCHAR)
        .param("jobTitle", filters.jobTitle?.trim()?.takeIf(String::isNotEmpty), Types.VARCHAR)
        .param("roleCode", filters.roleCode, Types.VARCHAR)
        .param("influence", filters.influence?.name, Types.VARCHAR)
        .param("decisionMaker", filters.decisionMaker, Types.BOOLEAN)
        .param("interaction", filters.interaction?.name, Types.VARCHAR)
        .param("responsibleManager", filters.responsibleManager?.trim()?.takeIf(String::isNotEmpty), Types.VARCHAR)
        .param("days", filters.days)
        .param("keyOnly", keyOnly)

    private fun contact(row: ResultSet) = DirectoryContactRow(
        id = row.getObject("id", UUID::class.java),
        name = row.getString("name"),
        jobTitle = row.getString("job_title"),
        department = row.getObject("department_id", UUID::class.java)
            ?.let { Department(it, row.getString("department_name")) },
        email = row.getString("email"),
        phone = row.getString("phone"),
        lastInteractionAt = row.getObject("occurred_at", OffsetDateTime::class.java)?.toInstant(),
        interaction = Recency.valueOf(row.getString("interaction")),
        responsibleManager = row.getString("responsible_manager"),
    )

    private companion object {
        const val CONTACT_COLUMNS = """
            c.id, c.name, c.job_title, d.id AS department_id, d.name AS department_name, c.email, c.phone,
            latest.occurred_at, coalesce(latest.interaction, 'UNKNOWN') AS interaction, latest.responsible_manager
        """

        const val ELIGIBLE_TOUCHES = """
            FROM initiatives i
            JOIN touchpoint_participants a ON a.initiative_id = i.id AND a.contact_id = c.id
            JOIN touchpoints t ON t.initiative_id = a.initiative_id AND t.id = a.touchpoint_id
            WHERE i.company_id = c.company_id AND t.occurred_at <= i.as_of
        """
    }
}

internal data class DirectoryContactRow(
    val id: UUID,
    val name: String,
    val jobTitle: String?,
    val department: Department?,
    val email: String?,
    val phone: String?,
    val lastInteractionAt: Instant?,
    val interaction: Recency,
    val responsibleManager: String?,
) {
    fun summarize(assignments: List<ContactAssignment>) = ContactSummary(
        id = id,
        name = name,
        jobTitle = jobTitle,
        department = department,
        roles = assignments.mapNotNull { it.role }.distinctBy { it.code }.sortedBy { it.label },
        influence = assignments.maxOfOrNull { it.influence } ?: Influence.UNKNOWN,
        decisionMaker = assignments.any { it.decisionMaker },
        lastInteractionAt = lastInteractionAt,
        interaction = interaction,
        responsibleManager = responsibleManager,
    )
}
