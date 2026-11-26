package ru.croc.insight.workspace

import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.CannotGetJdbcConnectionException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.stereotype.Service
import org.springframework.transaction.CannotCreateTransactionException
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.UUID_PATTERN
import ru.croc.insight.catalog.CatalogService

@Service
class WorkspaceWriter(
    private val reader: JdbcClient,
    private val catalog: CatalogService,
    @Value("\${spring.datasource.url}") private val dbUrl: String,
    @Value("\${croc.demo.writer-password:}") private val writerPassword: String,
) {
    val enabled get() = writerPassword.isNotBlank()

    private val dataSource by lazy { DriverManagerDataSource(dbUrl, "croc_writer", writerPassword).apply { schema = "insight" } }
    private val jdbc by lazy { JdbcClient.create(dataSource) }
    private val transaction by lazy { TransactionTemplate(DataSourceTransactionManager(dataSource)) }
    private val people by lazy { WorkspaceContacts(jdbc) }

    fun createProject(companyId: UUID, actor: String, change: ProjectChange): SavedWorkspaceItem {
        val name = change.name.requiredText()
        val due = change.due.text()?.let(::projectDate)
        return write {
            val visible = jdbc.sql("SELECT EXISTS (SELECT 1 FROM company_viewers WHERE company_id = :company AND viewer_key = :actor)")
                .param("company", companyId).param("actor", actor).query(Boolean::class.javaObjectType).single()
            if (!visible) throw missing("Компания недоступна.")
            lockCompany(companyId)
            val duplicate = jdbc.sql(
                "SELECT EXISTS (SELECT 1 FROM initiatives WHERE company_id = :company AND lower(btrim(name)) = lower(:name))",
            ).param("company", companyId).param("name", name).query(Boolean::class.javaObjectType).single()
            if (duplicate) throw conflict("Проект с таким названием уже есть.")

            val id = UUID.randomUUID()
            jdbc.sql(
                """
                INSERT INTO initiatives (id, company_id, name, as_of, stage, owner, due, next_step)
                VALUES (:id, :company, :name, CURRENT_TIMESTAMP, :stage, :owner, :due, :nextStep)
                """.trimIndent(),
            ).param("id", id).param("company", companyId).param("name", name)
                .param("stage", change.stage.text()).param("owner", change.owner.text()).param("due", due)
                .param("nextStep", change.nextStep.text()).update()
            SavedWorkspaceItem(id)
        }
    }

    fun saveParticipant(initiativeId: UUID, actor: String, personId: UUID?, change: ParticipantChange): SavedWorkspaceItem = write {
        val companyId = companyFor(initiativeId, actor)
        lockCompany(companyId)
        if (personId != null) requireMember(initiativeId, personId)
        people.save(initiativeId, companyId, personId, change)
    }

    fun importContacts(initiativeId: UUID, actor: String, records: List<ContactChange>): ImportedContacts {
        val normalized = records.map(ContactChange::normalized)
        return write {
            val companyId = companyFor(initiativeId, actor)
            lockCompany(companyId)
            people.importRows(initiativeId, companyId, normalized)
        }
    }

    fun saveRelationship(initiativeId: UUID, actor: String, relationshipId: UUID?, change: RelationshipChange): SavedWorkspaceItem {
        val source = UUID.fromString(change.source)
        val target = UUID.fromString(change.target)
        if (source == target) throw invalid("Выберите двух разных участников проекта.")
        val label = change.label.requiredText()
        val sourceLabel = change.sourceLabel.text()
        val confirmed = change.confirmed == true
        if (confirmed && sourceLabel == null) throw invalid("Для подтверждённой связи укажите основание.")
        val id = relationshipId ?: UUID.randomUUID()

        return write {
            companyFor(initiativeId, actor)
            requireMember(initiativeId, source)
            requireMember(initiativeId, target)
            val sql = if (relationshipId == null) {
                """
                INSERT INTO relationships (id, initiative_id, source_contact_id, target_contact_id, type, label, confirmed, source_label)
                VALUES (:id, :initiative, :source, :target, :type, :label, :confirmed, :sourceLabel)
                """
            } else {
                """
                UPDATE relationships
                SET source_contact_id = :source, target_contact_id = :target, type = :type,
                    label = :label, confirmed = :confirmed, source_label = :sourceLabel
                WHERE id = :id AND initiative_id = :initiative
                """
            }
            val affected = try {
                jdbc.sql(sql.trimIndent()).param("id", id).param("initiative", initiativeId)
                    .param("source", source).param("target", target).param("type", change.type).param("label", label)
                    .param("confirmed", confirmed).param("sourceLabel", sourceLabel).update()
            } catch (_: DuplicateKeyException) {
                throw conflict("Такая связь уже есть в проекте.")
            }
            if (affected == 0) throw missing("Связь недоступна.")
            SavedWorkspaceItem(id)
        }
    }

    fun requests(initiativeId: UUID, actor: String): List<InformationRequest> {
        if (catalog.findInitiative(actor, initiativeId) == null) throw missing("Проект недоступен.")
        return reader.sql(
            """
            SELECT q.id, q.contact_id, q.recipient, q.question, q.status, q.created_at
            FROM information_requests q
            JOIN initiatives i ON i.id = q.initiative_id
            JOIN company_viewers v ON v.company_id = i.company_id AND v.viewer_key = :actor
            WHERE q.initiative_id = :initiative AND q.owner_key = :actor
            ORDER BY q.created_at DESC, q.id
            """.trimIndent(),
        ).param("initiative", initiativeId).param("actor", actor).query { row, _ ->
            InformationRequest(
                row.getObject("id", UUID::class.java), row.getObject("contact_id", UUID::class.java),
                row.getString("recipient"), row.getString("question"), RequestStatus.valueOf(row.getString("status")),
                row.getObject("created_at", OffsetDateTime::class.java).toInstant(),
            )
        }.list()
    }

    fun createRequest(initiativeId: UUID, actor: String, change: RequestChange): SavedWorkspaceItem {
        val personId = change.personId.text()?.let { value ->
            if (!UUID_PATTERN.toRegex().matches(value)) throw invalid("Проверьте участника запроса.")
            UUID.fromString(value)
        }
        val recipient = change.recipient.requiredText()
        val question = change.question.requiredText()
        return write {
            companyFor(initiativeId, actor)
            if (personId != null) requireMember(initiativeId, personId)

            val id = UUID.randomUUID()
            jdbc.sql(
                """
                INSERT INTO information_requests (id, initiative_id, contact_id, owner_key, recipient, question)
                VALUES (:id, :initiative, :person, :actor, :recipient, :question)
                """.trimIndent(),
            ).param("id", id).param("initiative", initiativeId).param("person", personId).param("actor", actor)
                .param("recipient", recipient).param("question", question).update()
            SavedWorkspaceItem(id)
        }
    }

    fun editRequest(initiativeId: UUID, actor: String, requestId: UUID, status: RequestStatus): SavedWorkspaceItem = write {
        companyFor(initiativeId, actor)
        val count = jdbc.sql(
            "UPDATE information_requests SET status = :status WHERE id = :id AND initiative_id = :initiative AND owner_key = :actor",
        ).param("status", status.name).param("id", requestId).param("initiative", initiativeId).param("actor", actor).update()
        if (count == 0) throw missing("Запрос недоступен.")
        SavedWorkspaceItem(requestId)
    }

    private fun companyFor(initiativeId: UUID, actor: String): UUID = jdbc.sql(
        """
        SELECT i.company_id FROM initiatives i
        JOIN company_viewers v ON v.company_id = i.company_id AND v.viewer_key = :actor
        WHERE i.id = :initiative
        """.trimIndent(),
    ).param("initiative", initiativeId).param("actor", actor).query(UUID::class.java).optional()
        .orElseThrow { missing("Проект недоступен.") }

    private fun requireMember(initiativeId: UUID, personId: UUID) {
        val exists = jdbc.sql(
            "SELECT EXISTS (SELECT 1 FROM initiative_participants WHERE initiative_id = :initiative AND contact_id = :person)",
        ).param("initiative", initiativeId).param("person", personId).query(Boolean::class.javaObjectType).single()
        if (!exists) throw missing("Участник проекта недоступен.")
    }

    private fun lockCompany(companyId: UUID) {
        // serialize case-insensitive contact and project deduplication across editor sessions
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(CAST(:company AS text), 173602))")
            .param("company", companyId).query { _, _ -> Unit }.single()
    }

    private fun projectDate(value: String): LocalDate {
        if (!Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(value)) throw invalid("Проверьте срок проекта.")
        return try {
            LocalDate.parse(value).takeIf { it.year > 0 } ?: throw invalid("Проверьте срок проекта.")
        } catch (_: DateTimeParseException) {
            throw invalid("Проверьте срок проекта.")
        }
    }

    private fun <T : Any> write(action: () -> T): T {
        if (!enabled) throw unavailable()
        return try {
            requireNotNull(transaction.execute { action() })
        } catch (exception: CannotCreateTransactionException) {
            throw unavailable(exception)
        } catch (exception: CannotGetJdbcConnectionException) {
            throw unavailable(exception)
        }
    }

    private fun unavailable(cause: Throwable? = null) =
        ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Редактирование недоступно.", cause)
}

internal fun String?.text(): String? {
    if (this != null && '\u0000' in this) throw invalid("Проверьте текстовые поля.")
    return this?.trim()?.takeIf(String::isNotEmpty)
}

internal fun String.requiredText(): String = text() ?: throw invalid("Заполните обязательные поля.")
internal fun invalid(detail: String) = ResponseStatusException(HttpStatus.BAD_REQUEST, detail)
internal fun missing(detail: String) = ResponseStatusException(HttpStatus.NOT_FOUND, detail)
internal fun conflict(detail: String) = ResponseStatusException(HttpStatus.CONFLICT, detail)
