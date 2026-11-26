package ru.croc.insight

import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.security.Principal
import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.catalog.CompanySummary
import ru.croc.insight.catalog.InitiativeSummary
import ru.croc.insight.history.Coverage
import ru.croc.insight.history.CoverageService
import ru.croc.insight.history.InteractionManager
import ru.croc.insight.history.RelationshipHealth
import ru.croc.insight.history.TimelineFilters
import ru.croc.insight.history.TouchpointPage
import ru.croc.insight.history.TouchpointService
import ru.croc.insight.history.relationshipHealth
import ru.croc.insight.map.Graph
import ru.croc.insight.map.GraphService
import ru.croc.insight.map.ParticipantService
import ru.croc.insight.map.PersonDossier

internal const val UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"

@RestController
@RequestMapping("/api/v1")
class InsightReadController(
    private val catalog: CatalogService,
    private val graphs: GraphService,
    private val participants: ParticipantService,
    private val touchpoints: TouchpointService,
    private val coverage: CoverageService,
) {
    @GetMapping("/companies")
    fun companies(principal: Principal): List<CompanySummary> = catalog.companies(principal.name)

    @GetMapping("/companies/{companyId}/initiatives")
    fun initiatives(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        principal: Principal,
    ): List<InitiativeSummary> = catalog.initiatives(principal.name, UUID.fromString(companyId))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/initiatives/{initiativeId}/graph")
    fun graph(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @RequestParam(required = false) @Pattern(regexp = "^[A-Z][A-Z0-9_]{0,31}$") roleCode: String?,
        @RequestParam(required = false) @Pattern(regexp = UUID_PATTERN) departmentId: String?,
        principal: Principal,
    ): Graph = graphs.findGraph(
        principal.name,
        UUID.fromString(initiativeId),
        roleCode,
        departmentId?.let(UUID::fromString),
    ) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/initiatives/{initiativeId}/people/{personId}")
    fun person(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) personId: String,
        principal: Principal,
    ): PersonDossier = participants.findDossier(principal.name, UUID.fromString(initiativeId), UUID.fromString(personId))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/initiatives/{initiativeId}/events")
    fun events(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @RequestParam(required = false) @Pattern(regexp = UUID_PATTERN) personId: String?,
        @RequestParam(required = false) @Pattern(regexp = "^(?:[1-9]|[1-4][0-9]|50)$") limit: String?,
        @RequestParam(required = false) @Pattern(regexp = UUID_PATTERN) cursor: String?,
        @RequestParam(required = false) @Size(max = 40) @Pattern(regexp = "[0-9]{4}-.+") through: String?,
        principal: Principal,
    ): TouchpointPage = touchpoints.history(
        principal.name,
        UUID.fromString(initiativeId),
        personId?.let(UUID::fromString),
        limit?.toInt() ?: 20,
        cursor?.let(UUID::fromString),
        through?.let(::parseThrough),
    ) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/initiatives/{initiativeId}/interaction-managers")
    fun interactionManagers(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        principal: Principal,
    ): List<InteractionManager> = touchpoints.managers(principal.name, UUID.fromString(initiativeId))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/companies/{companyId}/events")
    fun companyEvents(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @RequestParam(required = false) @Pattern(regexp = UUID_PATTERN) personId: String?,
        @RequestParam(required = false) @Pattern(regexp = "^(?:[1-9]|[1-4][0-9]|50)$") limit: String?,
        @RequestParam(required = false) @Pattern(regexp = UUID_PATTERN) cursor: String?,
        @RequestParam(required = false) @Size(max = 40) @Pattern(regexp = "[0-9]{4}-.+") through: String?,
        @RequestParam(required = false) @Size(max = 160) responsibleManager: String?,
        @RequestParam(required = false) @Size(max = 120) q: String?,
        @RequestParam(required = false) @Pattern(regexp = "MEETING|CALL|EMAIL|NOTE|PROPOSAL") type: String?,
        @RequestParam(required = false) @Pattern(regexp = UUID_PATTERN) initiativeId: String?,
        principal: Principal,
    ): TouchpointPage = touchpoints.companyHistory(
        principal.name, UUID.fromString(companyId), personId?.let(UUID::fromString),
        limit?.toInt() ?: 20, cursor?.let(UUID::fromString), through?.let(::parseThrough),
        responsibleManager?.trim()?.takeIf(String::isNotEmpty),
        TimelineFilters(q?.trim()?.takeIf(String::isNotEmpty), type, initiativeId?.let(UUID::fromString)),
    ) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    private fun parseThrough(value: String): Instant = try {
        Instant.parse(value)
    } catch (_: DateTimeParseException) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "through must be an ISO date-time")
    }

    @GetMapping("/initiatives/{initiativeId}/coverage")
    fun coverage(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @RequestParam(required = false) @Pattern(regexp = "[0-9]{1,3}") days: String?,
        principal: Principal,
    ): Coverage = readCoverage(principal, initiativeId, days)

    @GetMapping("/initiatives/{initiativeId}/relationship-health")
    fun relationshipHealth(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @RequestParam(required = false) @Pattern(regexp = "[0-9]{1,3}") days: String?,
        principal: Principal,
    ): RelationshipHealth = readCoverage(principal, initiativeId, days).relationshipHealth()

    private fun readCoverage(principal: Principal, initiativeId: String, days: String?): Coverage {
        val period = days?.toInt() ?: 30
        if (period !in 1..365) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "days must be between 1 and 365")
        return coverage.find(principal.name, UUID.fromString(initiativeId), period)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
    }
}
