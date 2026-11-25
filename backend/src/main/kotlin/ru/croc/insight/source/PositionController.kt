package ru.croc.insight.source

import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.UUID_PATTERN
import ru.croc.insight.map.ParticipantService

data class PositionSource(val version: Int, val position: PositionRevision?, val canEdit: Boolean)

data class PositionChange(
    @field:Min(0) @field:Max(2147483646L) val expectedVersion: Int?,
    val stance: Stance,
    @field:NotBlank @field:Size(max = 1200) val basis: String,
)

@RestController
@RequestMapping("/api/v1/initiatives/{initiativeId}/people/{personId}/demo-source")
class PositionController(private val participants: ParticipantService, private val positions: PositionService) {
    @GetMapping
    fun source(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) personId: String,
        authentication: Authentication,
    ): PositionSource {
        val dossier = participants.findDossier(authentication.name, UUID.fromString(initiativeId), UUID.fromString(personId))
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return PositionSource(dossier.position?.version ?: 0, dossier.position, authentication.authorities.any {
            it.authority == "ROLE_DEMO_EDITOR"
        })
    }

    @PatchMapping
    fun update(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) personId: String,
        @Valid @RequestBody change: PositionChange,
        authentication: Authentication,
    ): PositionSource {
        val initiative = UUID.fromString(initiativeId)
        val person = UUID.fromString(personId)
        participants.findDossier(authentication.name, initiative, person)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val expectedVersion = change.expectedVersion
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "expectedVersion is required")
        val saved = positions.save(initiative, person, authentication.name, expectedVersion, change.stance, change.basis)
        return PositionSource(saved.version, saved, true)
    }
}
