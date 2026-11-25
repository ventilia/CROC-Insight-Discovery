package ru.croc.insight.ai

import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.security.Principal
import java.util.UUID
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import ru.croc.insight.UUID_PATTERN

data class NavigatorQuestion(
    @field:Min(1) @field:Max(365) val days: Int,
    @field:NotBlank @field:Size(max = 400) val question: String,
)

@RestController
class NavigatorController(private val navigator: LocalNavigator) {
    @GetMapping("/api/v1/ai/settings")
    fun settings(): LocalModelSettings = navigator.settings()

    @PostMapping("/api/v1/initiatives/{initiativeId}/ai/advice")
    fun advice(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody input: NavigatorQuestion,
        principal: Principal,
    ): NavigatorAnswer = navigator.advise(principal.name, UUID.fromString(initiativeId), input.days, input.question)
}
