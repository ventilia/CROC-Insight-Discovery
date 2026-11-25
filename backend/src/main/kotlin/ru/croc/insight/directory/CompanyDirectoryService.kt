package ru.croc.insight.directory

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.map.Department
import ru.croc.insight.map.GraphFilters

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
class CompanyDirectoryService(
    private val jdbc: JdbcClient,
    private val catalog: CatalogService,
    private val people: DirectoryContacts,
) {
    fun company(viewer: String, companyId: UUID): CompanyProfile? {
        val company = visibleCompany(viewer, companyId) ?: return null
        val keyPeople = people.list(companyId, limit = 5, keyOnly = true)
        return CompanyProfile(
            id = companyId,
            name = company.name,
            industry = company.industry,
            description = company.description,
            departments = departments(companyId),
            initiatives = catalog.initiatives(viewer, companyId).orEmpty(),
            contactCount = people.count(companyId),
            keyContacts = summaries(keyPeople, people.assignments(companyId, keyPeople.map { it.id })),
        )
    }

    fun contacts(viewer: String, companyId: UUID, filters: DirectoryFilters, limit: Int, offset: Int): ContactPage? {
        visibleCompany(viewer, companyId) ?: return null
        val rows = people.list(companyId, filters, limit, offset)
        return ContactPage(
            items = summaries(rows, people.assignments(companyId, rows.map { it.id })),
            total = people.count(companyId, filters),
            limit = limit,
            offset = offset,
        )
    }

    fun contact(viewer: String, companyId: UUID, contactId: UUID): ContactProfile? {
        visibleCompany(viewer, companyId) ?: return null
        val row = people.find(companyId, contactId) ?: return null
        val assignments = people.assignments(companyId, listOf(contactId))[contactId].orEmpty()
        return ContactProfile(
            companyId = companyId,
            summary = row.summarize(assignments),
            email = row.email,
            phone = row.phone,
            assignments = assignments,
            connections = connections(companyId, contactId),
        )
    }

    fun graph(viewer: String, companyId: UUID, filters: DirectoryFilters): CompanyGraph? {
        visibleCompany(viewer, companyId) ?: return null
        val rows = people.list(companyId, filters)
        val visibleIds = rows.mapTo(mutableSetOf()) { it.id }
        val assignments = people.assignments(companyId)
        return CompanyGraph(
            companyId = companyId,
            nodes = summaries(rows, assignments),
            edges = edges(companyId).filter { it.source in visibleIds && it.target in visibleIds },
            filters = GraphFilters(
                departments = departments(companyId),
                roles = assignments.values.asSequence().flatten().mapNotNull { it.role }
                    .distinctBy { it.code }.sortedBy { it.label }.toList(),
            ),
        )
    }

    private fun summaries(rows: List<DirectoryContactRow>, assignments: Map<UUID, List<ContactAssignment>>) =
        rows.map { it.summarize(assignments[it.id].orEmpty()) }

    private fun visibleCompany(viewer: String, companyId: UUID): CompanyRecord? = jdbc.sql(
        """
        SELECT c.name, c.industry, c.description
        FROM companies c
        JOIN company_viewers v ON v.company_id = c.id AND v.viewer_key = :viewer
        WHERE c.id = :companyId
        """.trimIndent(),
    )
        .param("viewer", viewer)
        .param("companyId", companyId)
        .query { row, _ -> CompanyRecord(row.getString("name"), row.getString("industry"), row.getString("description")) }
        .optional().orElse(null)

    private fun departments(companyId: UUID): List<Department> = jdbc.sql(
        """
        SELECT id, name FROM departments WHERE company_id = :companyId ORDER BY lower(name), id
        """.trimIndent(),
    )
        .param("companyId", companyId)
        .query { row, _ -> Department(row.getObject("id", UUID::class.java), row.getString("name")) }
        .list()

    private fun edges(companyId: UUID): List<CompanyGraphEdge> = jdbc.sql(
        """
        SELECT r.id, r.initiative_id, i.name AS initiative_name, r.source_contact_id, r.target_contact_id,
               r.type, r.label, r.confirmed
        FROM relationships r
        JOIN initiatives i ON i.id = r.initiative_id
        WHERE i.company_id = :companyId
        ORDER BY i.id, r.id
        """.trimIndent(),
    )
        .param("companyId", companyId)
        .query { row, _ ->
            CompanyGraphEdge(
                id = row.getObject("id", UUID::class.java),
                initiativeId = row.getObject("initiative_id", UUID::class.java),
                initiativeName = row.getString("initiative_name"),
                source = row.getObject("source_contact_id", UUID::class.java),
                target = row.getObject("target_contact_id", UUID::class.java),
                type = row.getString("type"),
                label = row.getString("label"),
                confirmed = row.getBoolean("confirmed"),
            )
        }
        .list()

    private fun connections(companyId: UUID, contactId: UUID): List<ContactConnection> = jdbc.sql(
        """
        SELECT r.id, r.initiative_id, i.name AS initiative_name, c.id AS contact_id, c.name,
               (r.source_contact_id = :contactId) AS outgoing, r.type, r.label, r.confirmed
        FROM relationships r
        JOIN initiatives i ON i.id = r.initiative_id
        JOIN contacts c ON c.company_id = i.company_id AND c.id = CASE
            WHEN r.source_contact_id = :contactId THEN r.target_contact_id ELSE r.source_contact_id END
        WHERE i.company_id = :companyId
          AND (r.source_contact_id = :contactId OR r.target_contact_id = :contactId)
        ORDER BY i.id, r.id
        """.trimIndent(),
    )
        .param("companyId", companyId)
        .param("contactId", contactId)
        .query { row, _ ->
            ContactConnection(
                id = row.getObject("id", UUID::class.java),
                contactId = row.getObject("contact_id", UUID::class.java),
                name = row.getString("name"),
                initiativeId = row.getObject("initiative_id", UUID::class.java),
                initiativeName = row.getString("initiative_name"),
                direction = if (row.getBoolean("outgoing")) ConnectionDirection.OUTGOING else ConnectionDirection.INCOMING,
                type = row.getString("type"),
                label = row.getString("label"),
                confirmed = row.getBoolean("confirmed"),
            )
        }
        .list()

    private data class CompanyRecord(val name: String, val industry: String?, val description: String?)
}
