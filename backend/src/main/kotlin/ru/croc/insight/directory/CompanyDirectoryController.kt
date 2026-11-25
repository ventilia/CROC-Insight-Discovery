package ru.croc.insight.directory

import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.security.Principal
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ModelAttribute
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.UUID_PATTERN
import ru.croc.insight.history.Recency

data class DirectoryFilters(
    @field:Size(max = 120) val q: String? = null,
    @field:Pattern(regexp = UUID_PATTERN) val departmentId: String? = null,
    @field:Size(max = 160) val jobTitle: String? = null,
    @field:Pattern(regexp = "^[A-Z][A-Z0-9_]{0,31}$") val roleCode: String? = null,
    val influence: Influence? = null,
    val interaction: Recency? = null,
    @field:Size(max = 160) val responsibleManager: String? = null,
    @field:Min(1) @field:Max(365) val days: Int = 30,
)

@RestController
@RequestMapping("/api/v1/companies/{companyId}")
class CompanyDirectoryController(private val directory: CompanyDirectoryService) {
    @GetMapping
    fun company(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        principal: Principal,
    ): CompanyProfile = directory.company(principal.name, UUID.fromString(companyId))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/contacts")
    fun contacts(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @Valid @ModelAttribute filters: DirectoryFilters,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) limit: Int,
        @RequestParam(defaultValue = "0") @Min(0) offset: Int,
        principal: Principal,
    ): ContactPage = directory.contacts(principal.name, UUID.fromString(companyId), filters, limit, offset)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/contacts/{contactId}")
    fun contact(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @PathVariable @Pattern(regexp = UUID_PATTERN) contactId: String,
        principal: Principal,
    ): ContactProfile = directory.contact(principal.name, UUID.fromString(companyId), UUID.fromString(contactId))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/graph")
    fun graph(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @Valid @ModelAttribute filters: DirectoryFilters,
        principal: Principal,
    ): CompanyGraph = directory.graph(principal.name, UUID.fromString(companyId), filters)
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
}
