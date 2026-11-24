package ru.croc.insight

import jakarta.validation.constraints.Pattern
import java.security.Principal
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
import ru.croc.insight.map.Graph
import ru.croc.insight.map.GraphService

private const val UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"

@RestController
@RequestMapping("/api/v1")
class InsightReadController(private val catalog: CatalogService, private val graphs: GraphService) {
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
}
