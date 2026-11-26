package ru.croc.insight.workspace

import java.security.MessageDigest
import java.util.HexFormat
import java.util.Locale
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient

internal class WorkspaceContacts(private val jdbc: JdbcClient) {
    fun save(initiativeId: UUID, companyId: UUID, personId: UUID?, change: ParticipantChange): SavedWorkspaceItem {
        val contact = ContactChange(change.name, change.jobTitle, change.department, change.email, change.phone).normalized()
        val influence = change.influence.text()
        val basis = change.influenceBasis.text()
        if (influence != null && influence !in setOf("HIGH", "MEDIUM", "LOW")) throw invalid("Проверьте оценку влияния.")
        if (influence != null && basis == null) throw invalid("Укажите основание оценки влияния.")
        val version = if (personId == null) null else change.expectedVersion ?: throw invalid("Проверьте версию карточки.")
        if (contact.email != null && emailExists(companyId, personId, contact.email)) {
            throw conflict("Контакт с таким email уже существует. Используйте импорт или существующую карточку.")
        }

        val departmentId = departmentId(companyId, contact.department, departments(companyId))
        val id = personId ?: insertContact(companyId, departmentId, contact)
        if (version != null) updateContact(companyId, id, departmentId, contact, version)
        jdbc.sql(
            """
            INSERT INTO initiative_participants (initiative_id, company_id, contact_id, role_code, decision_maker,
                influence, influence_basis, mandate, interest, source_label)
            VALUES (:initiative, :company, :contact, :role, :decisionMaker, :influence, :basis, :mandate, :interest, :sourceLabel)
            ON CONFLICT (initiative_id, contact_id) DO UPDATE SET role_code = EXCLUDED.role_code,
                decision_maker = EXCLUDED.decision_maker, influence = EXCLUDED.influence, influence_basis = EXCLUDED.influence_basis,
                mandate = EXCLUDED.mandate, interest = EXCLUDED.interest, source_label = EXCLUDED.source_label
            """.trimIndent(),
        ).param("initiative", initiativeId).param("company", companyId).param("contact", id)
            .param("role", roleCode(change.roleLabel.text())).param("decisionMaker", change.decisionMaker == true)
            .param("influence", influence).param("basis", basis).param("mandate", change.mandate.text())
            .param("interest", change.interest.text()).param("sourceLabel", change.sourceLabel.text()).update()
        return SavedWorkspaceItem(id)
    }

    fun importRows(initiativeId: UUID, companyId: UUID, records: List<ContactChange>): ImportedContacts {
        val emails = mutableMapOf<String, UUID>()
        val names = mutableMapOf<Triple<String, String, String>, UUID>()
        jdbc.sql(
            """
            SELECT c.id, c.name, c.job_title, d.name AS department_name, c.email
            FROM contacts c
            LEFT JOIN departments d ON d.company_id = c.company_id AND d.id = c.department_id
            WHERE c.company_id = :company
            ORDER BY c.id
            """.trimIndent(),
        ).param("company", companyId).query { row, _ ->
            val id = row.getObject("id", UUID::class.java)
            val email = normalize(row.getString("email"))
            if (email.isNotEmpty()) emails.putIfAbsent(email, id)
            names.putIfAbsent(nameKey(row.getString("name"), row.getString("job_title"), row.getString("department_name")), id)
        }.list()
        val departments = departments(companyId)
        var created = 0
        var attached = 0
        for (contact in records) {
            val email = normalize(contact.email)
            val key = nameKey(contact.name, contact.jobTitle, contact.department)
            val existing = if (email.isEmpty()) names[key] else emails[email]
            val id = existing ?: insertContact(companyId, departmentId(companyId, contact.department, departments), contact).also {
                if (email.isNotEmpty()) emails[email] = it
                names[key] = it
                created++
            }
            attached += jdbc.sql(
                """
                INSERT INTO initiative_participants (initiative_id, company_id, contact_id)
                VALUES (:initiative, :company, :contact)
                ON CONFLICT (initiative_id, contact_id) DO NOTHING
                """.trimIndent(),
            ).param("initiative", initiativeId).param("company", companyId).param("contact", id).update()
        }
        return ImportedContacts(created, attached, records.size - attached)
    }

    private fun departments(companyId: UUID): MutableMap<String, UUID> = jdbc.sql(
        "SELECT id, name FROM departments WHERE company_id = :company ORDER BY id",
    ).param("company", companyId).query { row, _ ->
        normalize(row.getString("name")) to row.getObject("id", UUID::class.java)
    }.list().toMap(mutableMapOf())

    private fun departmentId(companyId: UUID, name: String?, existing: MutableMap<String, UUID>): UUID? =
        name?.let {
            existing.getOrPut(normalize(name)) {
                val id = UUID.randomUUID()
                jdbc.sql("INSERT INTO departments (id, company_id, name) VALUES (:id, :company, :name)")
                    .param("id", id).param("company", companyId).param("name", name).update()
                id
            }
        }

    private fun emailExists(companyId: UUID, personId: UUID?, email: String): Boolean = jdbc.sql(
        """
        SELECT EXISTS (SELECT 1 FROM contacts WHERE company_id = :company
            AND lower(btrim(email)) = lower(:email) AND id IS DISTINCT FROM CAST(:id AS uuid))
        """.trimIndent(),
    ).param("company", companyId).param("email", email).param("id", personId).query(Boolean::class.javaObjectType).single()

    private fun insertContact(companyId: UUID, departmentId: UUID?, contact: ContactChange): UUID {
        val id = UUID.randomUUID()
        jdbc.sql(
            """
            INSERT INTO contacts (id, company_id, department_id, name, job_title, email, phone)
            VALUES (:id, :company, :department, :name, :job, :email, :phone)
            """.trimIndent(),
        ).param("id", id).param("company", companyId).param("department", departmentId).param("name", contact.name)
            .param("job", contact.jobTitle).param("email", contact.email).param("phone", contact.phone).update()
        return id
    }

    private fun updateContact(companyId: UUID, id: UUID, departmentId: UUID?, contact: ContactChange, version: Int) {
        val count = jdbc.sql(
            """
            UPDATE contacts SET department_id = :department, name = :name, job_title = :job, email = :email,
                phone = :phone, edit_version = edit_version + 1
            WHERE id = :id AND company_id = :company AND edit_version = :version
            """.trimIndent(),
        ).param("id", id).param("company", companyId).param("department", departmentId).param("name", contact.name)
            .param("job", contact.jobTitle).param("email", contact.email).param("phone", contact.phone)
            .param("version", version).update()
        if (count == 0) throw conflict("Карточка уже изменилась. Обновите страницу перед редактированием.")
    }

    private fun roleCode(label: String?): String? {
        if (label == null) return null
        val existing = jdbc.sql("SELECT code FROM participant_roles WHERE lower(btrim(label)) = lower(:label) ORDER BY code LIMIT 1")
            .param("label", label).query(String::class.java).optional()
        if (existing.isPresent) return existing.get()
        val digest = MessageDigest.getInstance("SHA-256").digest(normalize(label).toByteArray())
        val code = "CUSTOM_" + HexFormat.of().withUpperCase().formatHex(digest, 0, 8)
        jdbc.sql("INSERT INTO participant_roles (code, label) VALUES (:code, :label) ON CONFLICT (code) DO NOTHING")
            .param("code", code).param("label", label).update()
        return code
    }

    private fun nameKey(name: String?, job: String?, department: String?) = Triple(normalize(name), normalize(job), normalize(department))
    private fun normalize(value: String?): String = value.orEmpty().trim().lowercase(Locale.ROOT)
}

internal fun ContactChange.normalized(): ContactChange {
    val cleanEmail = email.text()
    if (cleanEmail != null && !Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").matches(cleanEmail)) {
        throw invalid("Проверьте рабочий email.")
    }
    return ContactChange(name.requiredText(), jobTitle.text(), department.text(), cleanEmail, phone.text())
}
