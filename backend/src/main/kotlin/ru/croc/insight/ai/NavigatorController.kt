package ru.croc.insight.ai

import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.security.Principal
import java.util.UUID
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import ru.croc.insight.UUID_PATTERN

enum class NavigatorMode(val instruction: String) {
    QUESTION("Дай практический следующий шаг и укажи факты, на которые опираешься."),
    MEETING_BRIEF("Составь бриф: цель встречи, кого пригласить и зачем, три нейтральных вопроса и какую договорённость зафиксировать. Проектные интересы и оценки позиций используй как контекст для проверки."),
    TEST_HYPOTHESIS("Раздели ответ на наблюдение, гипотезу и альтернативное объяснение. Предложи нейтральный вопрос, который поможет отличить эти версии. При отсутствии данных прямо укажи пробел."),
    CONTACT_FALLBACK("Рассмотри условный сценарий: ЛПР с недавним касанием временно недоступен. Если таких несколько, укажи, почему выбрал одного. Покажи затронутые согласования и возможную точку входа по подтверждённым связям. Отделяй право принимать решение от возможности познакомить с нужным человеком. Если замена или рабочий канал не подтверждены, предложи способ проверки."),
}

data class NavigatorQuestion(
    @field:Min(1) @field:Max(365) val days: Int,
    @field:NotBlank @field:Size(max = 400) val question: String,
    val allowExternal: Boolean = false,
    val mode: NavigatorMode = NavigatorMode.QUESTION,
)

class LocalModelSelection(
    val provider: LocalProvider,
    @field:NotBlank @field:Size(max = 120) @field:Pattern(regexp = "[^\\p{Cntrl}]+") val model: String,
    @field:Size(max = 500) @field:Pattern(regexp = "[!-~]*") val apiKey: String? = null,
    val allowExternal: Boolean = false,
)

@RestController
class NavigatorController(private val navigator: LocalNavigator) {
    @GetMapping("/api/v1/ai/settings")
    fun settings(authentication: Authentication): LocalModelSettings =
        navigator.settings(authentication.name, authentication.authorities.any { it.authority == "ROLE_DEMO_EDITOR" })

    @PutMapping("/api/v1/ai/settings")
    fun configure(@Valid @RequestBody input: LocalModelSelection, principal: Principal): LocalModelSettings =
        navigator.configure(principal.name, input.provider, input.model.trim(), input.apiKey, input.allowExternal)

    @DeleteMapping("/api/v1/ai/settings")
    fun reset(principal: Principal): LocalModelSettings = navigator.reset(principal.name)

    @PostMapping("/api/v1/initiatives/{initiativeId}/ai/advice")
    fun advice(
        @PathVariable @Pattern(regexp = UUID_PATTERN) initiativeId: String,
        @Valid @RequestBody input: NavigatorQuestion,
        principal: Principal,
    ): NavigatorAnswer = navigator.advise(principal.name, UUID.fromString(initiativeId), input.days, input.question, input.allowExternal, input.mode)

    @PostMapping("/api/v1/companies/{companyId}/ai/advice")
    fun companyAdvice(
        @PathVariable @Pattern(regexp = UUID_PATTERN) companyId: String,
        @Valid @RequestBody input: NavigatorQuestion,
        principal: Principal,
    ): NavigatorAnswer = navigator.adviseCompany(principal.name, UUID.fromString(companyId), input.days, input.question, input.allowExternal, input.mode)
}
