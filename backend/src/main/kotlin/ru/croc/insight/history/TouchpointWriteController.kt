package ru.croc.insight.history

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PastOrPresent
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import ru.croc.insight.UUID_PATTERN
import ru.croc.insight.workspace.WorkspaceWriter

data class TouchpointChange(
    @field:Pattern(regexp = UUID_PATTERN) val id: String,
    @field:Pattern(regexp = "MEETING|CALL|EMAIL|NOTE|PROPOSAL") val type: String,
    @field:PastOrPresent val occurredAt: Instant,
    @field:NotBlank @field:Size(max = 160) val team: String,
    @field:NotBlank @field:Size(max = 300) val subject: String,
    @field:Size(max = 2000) val outcome: String? = null,
    @field:Size(max = 2000) val nextStep: String? = null,
    @field:Size(max = 2000) val comment: String? = null,
    @field:NotBlank @field:Size(max = 160) val responsibleManager: String,
    @field:Size(min = 1, max = 50) val participantIds: List<String?>,
)

data class Capabilities(
    val mode: String,
    val canCreateEvents: Boolean,
    val canImportContacts: Boolean,
    val canManageWorkspace: Boolean,
)
data class CreatedTouchpoint(val id: UUID)

@RestController
@RequestMapping("/api/v1")
class TouchpointWriteController(private val writer: TouchpointWriter, private val workspace: WorkspaceWriter) {
    @GetMapping("/capabilities")
    fun capabilities(authentication: Authentication): Capabilities {
        val editor = authentication.authorities.any { it.authority == "ROLE_DEMO_EDITOR" }
        return Capabilities("api", writer.enabled && editor, workspace.enabled && editor, workspace.enabled && editor)
    }

    @PostMapping("/initiatives/{initiativeId}/events")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody change: TouchpointChange,
        authentication: Authentication,
    ): CreatedTouchpoint = writer.save(UUID.fromString(initiativeId), authentication.name, change)
}
