package ru.croc.insight.ai

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.web.server.ResponseStatusException
import ru.croc.insight.catalog.CatalogService
import ru.croc.insight.catalog.InitiativeSummary
import ru.croc.insight.dashboard.DashboardService
import ru.croc.insight.history.ContactCoverage
import ru.croc.insight.history.Coverage
import ru.croc.insight.history.CoverageService
import ru.croc.insight.history.DepartmentCoverage
import ru.croc.insight.history.Recency
import ru.croc.insight.history.Touchpoint
import ru.croc.insight.history.TouchpointPage
import ru.croc.insight.history.TouchpointService
import ru.croc.insight.map.Department
import ru.croc.insight.map.Graph
import ru.croc.insight.map.GraphEdge
import ru.croc.insight.map.GraphFilters
import ru.croc.insight.map.GraphNode
import ru.croc.insight.map.GraphService
import ru.croc.insight.map.ParticipantRole
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

class OpenAiNavigatorTest {
    @Test
    fun `server OpenAI sends a redacted project snapshot only after per-question consent`() {
        val viewer = "test-reader"
        val projectId = UUID.randomUUID()
        val companyId = UUID.randomUUID()
        val contactId = UUID.randomUUID()
        val sourceId = UUID.randomUUID()
        val asOf = Instant.parse("2026-11-24T09:00:00Z")
        val department = Department(UUID.randomUUID(), "Частное подразделение")
        val catalog = mock(CatalogService::class.java)
        val coverage = mock(CoverageService::class.java)
        val touchpoints = mock(TouchpointService::class.java)
        val dashboard = mock(DashboardService::class.java)
        val graphs = mock(GraphService::class.java)
        `when`(catalog.findInitiative(viewer, projectId)).thenReturn(
            InitiativeSummary(projectId, companyId, "Частный проект", asOf,
                "Закрытая стадия", "Частный руководитель", LocalDate.parse("2026-12-01"), "Внутренний следующий шаг", 2),
        )
        `when`(coverage.find(viewer, projectId, 30)).thenReturn(
            Coverage(projectId, asOf, 30, 90,
                listOf(
                    ContactCoverage(contactId, "Частное лицо", "Частная должность", department, true,
                        asOf, Recency.RECENT, null, Recency.UNKNOWN),
                    ContactCoverage(sourceId, "Частный эксперт", null, department, false,
                        asOf, Recency.RECENT, asOf, Recency.RECENT),
                ),
                listOf(DepartmentCoverage(department.id, department.name, 2, 2, asOf, Recency.RECENT))),
        )
        `when`(touchpoints.history(viewer, projectId, null, 5, null, asOf)).thenReturn(
            TouchpointPage(listOf(Touchpoint(UUID.randomUUID(), "MEETING", asOf, "Частная команда",
                "Частная тема", "Частный результат", "Частное действие", "Частный источник")), null),
        )
        val role = ParticipantRole("BUDGET_APPROVER", "Частное описание роли")
        `when`(graphs.findGraph(viewer, projectId, null, null)).thenReturn(
            Graph(companyId, projectId, asOf, listOf(
                GraphNode(contactId, "Частное лицо", null, department, role, true, influence = "HIGH"),
                GraphNode(sourceId, "Частный эксперт", null, department, null, false),
            ), listOf(
                GraphEdge(UUID.randomUUID(), sourceId, contactId, "APPROVAL", "Частная связь", true, "Частный источник"),
                GraphEdge(UUID.randomUUID(), contactId, sourceId, "EXPERTISE", "Неподтверждённая связь", false),
            ), GraphFilters(listOf(department), listOf(role))),
        )

        val mapper = JsonMapper.builder().build()
        val requests = LinkedBlockingQueue<Pair<String?, JsonNode>>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/chat/completions") { exchange ->
            exchange.use {
                requests.add(exchange.requestHeaders.getFirst("Authorization") to mapper.readTree(exchange.requestBody))
                val response = """{"choices":[{"message":{"content":"Уточните данные у [C1]."}}]}""".toByteArray()
                exchange.sendResponseHeaders(200, response.size.toLong())
                exchange.responseBody.write(response)
            }
        }
        server.start()
        try {
            val navigatorContext = NavigatorContext(catalog, coverage, touchpoints, dashboard, graphs)
            val modelEndpoint = URI.create("http://127.0.0.1:${server.address.port}/v1/chat/completions")
            LocalNavigator(navigatorContext, mapper, "", "", 2_000, "mock-test-key", "", modelEndpoint).use { navigator ->
                val settings = navigator.settings(viewer, false)
                assertThat(settings.provider).isEqualTo(LocalProvider.OPENAI)
                assertThat(settings.model).isEqualTo("gpt-4.1-mini")
                assertThat(settings.hasApiKey).isTrue()

                val denied = assertThrows<ResponseStatusException> {
                    navigator.advise(viewer, projectId, 30, "Кого проверить?", allowExternal = false)
                }
                assertThat(denied.statusCode.value()).isEqualTo(400)
                assertThat(requests).isEmpty()

                val answer = navigator.advise(viewer, projectId, 30, "Кого проверить?", allowExternal = true)
                val (authorization, body) = checkNotNull(requests.poll(1, TimeUnit.SECONDS))
                assertThat(authorization).isEqualTo("Bearer mock-test-key")
                assertThat(body.path("model").asString()).isEqualTo("gpt-4.1-mini")
                assertThat(body.path("store").asBoolean(true)).isFalse()
                assertThat(body.path("max_completion_tokens").asInt()).isPositive()
                assertThat(body.path("messages").path(1).path("content").asString())
                    .contains("Кого проверить?", "C1", "2026-12-01", "MEETING", "UNKNOWN", "nextStepRecorded",
                        "BUDGET_APPROVER", "HIGH", "APPROVAL", "sourceRef", "targetRef")
                    .doesNotContain("Частн", "Закрытая стадия", "Внутренний следующий шаг", "EXPERTISE", projectId.toString(), contactId.toString())
                assertThat(answer.answer).isEqualTo("Уточните данные у [Частное лицо].")
            }
        } finally {
            server.stop(0)
        }
    }
}
