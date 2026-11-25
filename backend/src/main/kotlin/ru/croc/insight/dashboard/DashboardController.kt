package ru.croc.insight.dashboard

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
import ru.croc.insight.UUID_PATTERN

@RestController
@RequestMapping("/api/v1")
class DashboardController(private val dashboard: DashboardService) {
    @GetMapping("/dashboard")
    fun dashboard(
        @RequestParam(required = false) @Pattern(regexp = "[0-9]{1,3}") days: String?,
        principal: Principal,
    ): DashboardResponse = dashboard.dashboard(principal.name, period(days))

    @GetMapping("/companies/{companyId}/insights")
    fun companyInsights(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @RequestParam(required = false) @Pattern(regexp = "[0-9]{1,3}") days: String?,
        principal: Principal,
    ): CompanyInsightsResponse = dashboard.companyInsights(principal.name, UUID.fromString(companyId), period(days))
        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    private fun period(days: String?): Int {
        val period = days?.toInt() ?: 30
        if (period !in 1..365) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "days must be between 1 and 365")
        return period
    }
}
