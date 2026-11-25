package ru.croc.insight.history

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.PastOrPresent
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.UUID_PATTERN
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.map.ParticipantService

data class TouchpointChange(
    @field:Pattern(regexp = UUID_PATTERN) val id: String,
    @field:Pattern(regexp = "MEETING|CALL|EMAIL|NOTE|PROPOSAL") val type: String,
    @field:PastOrPresent val occurredAt: Instant,
    @field:NotBlank @field:Size(max = 160) val team: String,
    @field:NotBlank @field:Size(max = 300) val subject: String,
    @field:Size(max = 2000) val outcome: String?,
    @field:Size(max = 2000) val nextStep: String?,
    @field:NotBlank @field:Size(max = 160) val responsibleManager: String,
    @field:NotEmpty @field:Size(max = 50) val participantIds: List<String>,
)

@RestController
@RequestMapping("/api/v1")
class TouchpointWriteController(
    private val catalog: CatalogService,
    private val participants: ParticipantService,
    private val writer: TouchpointWriter,
) {
    @GetMapping("/capabilities")
    fun capabilities(authentication: Authentication) = mapOf(
        "mode" to "api",
        "canCreateEvents" to (writer.enabled && authentication.authorities.any { it.authority == "ROLE_DEMO_EDITOR" }),
    )

    @PostMapping("/initiatives/{initiativeId}/events")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody change: TouchpointChange,
        authentication: Authentication,
    ): Map<String, String> {
        val initiative = UUID.fromString(initiativeId)
        catalog.findInitiative(authentication.name, initiative) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (change.participantIds.any { !Regex(UUID_PATTERN).matches(it) }) throw ResponseStatusException(HttpStatus.BAD_REQUEST)
        if (change.participantIds.distinct().size != change.participantIds.size ||
            change.participantIds.any { !participants.exists(initiative, UUID.fromString(it)) }) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Participants must belong to this initiative")
        }
        writer.save(initiative, authentication.name, change)
        return mapOf("id" to change.id)
    }
}

@Service
class TouchpointWriter(
    @Value("\${spring.datasource.url}") private val dbUrl: String,
    @Value("\${croc.demo.writer-password:}") private val password: String,
) {
    val enabled get() = password.isNotBlank()
    private val datasource by lazy { DriverManagerDataSource(dbUrl, "croc_writer", password).apply { schema = "insight" } }

    fun save(initiative: UUID, author: String, change: TouchpointChange) {
        if (!enabled) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Editing is disabled")
        val canonical = listOf(initiative.toString(), author, change.type, change.occurredAt.toString(),
            change.team.trim(), change.subject.trim(), change.outcome?.trim().orEmpty(), change.nextStep?.trim().orEmpty(),
            change.responsibleManager.trim(), change.participantIds.sorted().joinToString(","))
            .joinToString("") { "${it.length}:$it" }
        val fingerprint = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray()).joinToString("") { "%02x".format(it) }
        val jdbc = JdbcClient.create(datasource)
        TransactionTemplate(DataSourceTransactionManager(datasource)).executeWithoutResult {
            val inserted = jdbc.sql("""
                INSERT INTO touchpoints (id, initiative_id, type, occurred_at, team, subject, outcome, next_step,
                    source_label, responsible_manager, created_by, request_fingerprint)
                SELECT :id, i.id, :type, :occurredAt, :team, :subject, :outcome, :nextStep,
                    'Запись KIT', :manager, :author, :fingerprint
                FROM initiatives i JOIN company_viewers v ON v.company_id = i.company_id AND v.viewer_key = :author
                WHERE i.id = :initiativeId
                ON CONFLICT (id) DO NOTHING
            """.trimIndent())
                .param("id", UUID.fromString(change.id)).param("initiativeId", initiative)
                .param("type", change.type).param("occurredAt", change.occurredAt.atOffset(java.time.ZoneOffset.UTC))
                .param("team", change.team.trim()).param("subject", change.subject.trim())
                .param("outcome", change.outcome?.trim()?.takeIf { it.isNotEmpty() })
                .param("nextStep", change.nextStep?.trim()?.takeIf { it.isNotEmpty() })
                .param("manager", change.responsibleManager.trim()).param("author", author).param("fingerprint", fingerprint)
                .update()
            if (inserted == 0) {
                val existing = jdbc.sql("SELECT request_fingerprint FROM touchpoints WHERE id = :id")
                    .param("id", UUID.fromString(change.id)).query(String::class.java).optional().orElse("")
                if (existing != fingerprint) throw ResponseStatusException(HttpStatus.CONFLICT, "Event ID already used")
                return@executeWithoutResult
            }
            for (person in change.participantIds) {
                jdbc.sql("INSERT INTO touchpoint_participants (initiative_id, touchpoint_id, contact_id) VALUES (:initiative, :event, :person)")
                    .param("initiative", initiative).param("event", UUID.fromString(change.id)).param("person", UUID.fromString(person)).update()
            }
            jdbc.sql("UPDATE initiatives SET as_of = GREATEST(as_of, CURRENT_TIMESTAMP) WHERE id = :id").param("id", initiative).update()
        }
    }
}
