package ru.croc.insight.workspace

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.PositiveOrZero
import jakarta.validation.constraints.Size
import java.security.Principal
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import ru.croc.insight.UUID_PATTERN

data class ProjectChange(
    @field:NotBlank @field:Size(max = 200) val name: String,
    @field:Size(max = 100) val stage: String? = null,
    @field:Size(max = 200) val owner: String? = null,
    @field:Size(max = 32) val due: String? = null,
    @field:Size(max = 500) val nextStep: String? = null,
)

data class ContactChange(
    @field:NotBlank @field:Size(max = 200) val name: String,
    @field:Size(max = 300) val jobTitle: String? = null,
    @field:Size(max = 160) val department: String? = null,
    @field:Size(max = 254) val email: String? = null,
    @field:Size(max = 60) val phone: String? = null,
)

data class ParticipantChange(
    @field:NotBlank @field:Size(max = 200) val name: String,
    @field:Size(max = 300) val jobTitle: String? = null,
    @field:Size(max = 160) val department: String? = null,
    @field:Size(max = 254) val email: String? = null,
    @field:Size(max = 60) val phone: String? = null,
    @field:Size(max = 120) val roleLabel: String? = null,
    @field:NotNull val decisionMaker: Boolean?,
    @field:Size(max = 10) val influence: String? = null,
    @field:Size(max = 500) val influenceBasis: String? = null,
    @field:Size(max = 200) val mandate: String? = null,
    @field:Size(max = 500) val interest: String? = null,
    @field:Size(max = 300) val sourceLabel: String? = null,
    @field:PositiveOrZero val expectedVersion: Int? = null,
)

data class RelationshipChange(
    @field:Pattern(regexp = UUID_PATTERN) val source: String,
    @field:Pattern(regexp = UUID_PATTERN) val target: String,
    @field:Pattern(regexp = "APPROVAL|COORDINATION|EXPERTISE") val type: String,
    @field:NotBlank @field:Size(max = 300) val label: String,
    @field:NotNull val confirmed: Boolean?,
    @field:Size(max = 500) val sourceLabel: String? = null,
)

data class RequestChange(
    @field:Size(max = 36) val personId: String? = null,
    @field:NotBlank @field:Size(max = 200) val recipient: String,
    @field:NotBlank @field:Size(max = 1000) val question: String,
)

enum class RequestStatus { DRAFT, DONE }

data class RequestStatusChange(val status: RequestStatus)

data class InformationRequest(
    val id: UUID,
    val personId: UUID?,
    val recipient: String,
    val question: String,
    val status: RequestStatus,
    val createdAt: Instant,
)

data class ContactImport(@field:Size(min = 1, max = 500) @field:Valid val contacts: List<@NotNull ContactChange>)
data class ImportedContacts(val created: Int, val attached: Int, val skipped: Int)
data class SavedWorkspaceItem(val id: UUID)

@RestController
@RequestMapping("/api/v1")
class WorkspaceController(private val workspace: WorkspaceWriter) {
    @PostMapping("/companies/{companyId}/initiatives")
    @ResponseStatus(HttpStatus.CREATED)
    fun createProject(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @Valid @RequestBody change: ProjectChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.createProject(UUID.fromString(companyId), principal.name, change)

    @PostMapping("/initiatives/{initiativeId}/people")
    @ResponseStatus(HttpStatus.CREATED)
    fun createParticipant(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody change: ParticipantChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.saveParticipant(UUID.fromString(initiativeId), principal.name, null, change)

    @PatchMapping("/initiatives/{initiativeId}/people/{personId}")
    fun editParticipant(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) personId: String,
        @Valid @RequestBody change: ParticipantChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.saveParticipant(UUID.fromString(initiativeId), principal.name, UUID.fromString(personId), change)

    @PostMapping("/initiatives/{initiativeId}/relationships")
    @ResponseStatus(HttpStatus.CREATED)
    fun createRelationship(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody change: RelationshipChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.saveRelationship(UUID.fromString(initiativeId), principal.name, null, change)

    @PatchMapping("/initiatives/{initiativeId}/relationships/{relationshipId}")
    fun editRelationship(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) relationshipId: String,
        @Valid @RequestBody change: RelationshipChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.saveRelationship(UUID.fromString(initiativeId), principal.name, UUID.fromString(relationshipId), change)

    @GetMapping("/initiatives/{initiativeId}/requests")
    fun requests(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        principal: Principal,
    ): List<InformationRequest> = workspace.requests(UUID.fromString(initiativeId), principal.name)

    @PostMapping("/initiatives/{initiativeId}/requests")
    @ResponseStatus(HttpStatus.CREATED)
    fun createRequest(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody change: RequestChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.createRequest(UUID.fromString(initiativeId), principal.name, change)

    @PatchMapping("/initiatives/{initiativeId}/requests/{requestId}")
    fun editRequest(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) requestId: String,
        @RequestBody change: RequestStatusChange,
        principal: Principal,
    ): SavedWorkspaceItem = workspace.editRequest(UUID.fromString(initiativeId), principal.name, UUID.fromString(requestId), change.status)

    @PostMapping("/initiatives/{initiativeId}/imports/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    fun importContacts(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody change: ContactImport,
        principal: Principal,
    ): ImportedContacts = workspace.importContacts(UUID.fromString(initiativeId), principal.name, change.contacts)
}
