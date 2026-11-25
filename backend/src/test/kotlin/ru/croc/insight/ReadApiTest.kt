package ru.croc.insight

import com.sun.net.httpserver.HttpServer
import java.io.IOException
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.time.Duration
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicReference
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.assertThrows
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.MountableFile
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("demo")
@Testcontainers
class ReadApiTest(@LocalServerPort private val port: Int) {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val mapper = JsonMapper.builder().build()

    @Test
    fun `relationship health returns a scored snapshot with factor counts`() {
        val path = "/api/v1/initiatives/$modernization/relationship-health"
        val health = read("$path?days=7")
        assertThat(health.path("score").asInt()).isEqualTo(80)
        assertThat(health.path("status").asString()).isEqualTo("PARTIAL")
        assertThat(health.path("decisionMakerTouches").path("recent").asInt()).isEqualTo(2)
        assertThat(health.path("departmentTouches").path("total").asInt()).isEqualTo(3)
        assertThat(health.path("decisionMakerVerification").path("recent").asInt()).isEqualTo(1)
        assertThat(health.path("contactsWithoutTouchpoints").asInt()).isEqualTo(1)
        assertThat(health.path("asOf").asString()).isEqualTo("2026-11-24T09:00:00Z")
        assertThat(get("$path?days=0").statusCode()).isEqualTo(400)
        assertThat(get(path, password = null).statusCode()).isEqualTo(401)
        assertThat(get("/api/v1/initiatives/$privateInitiative/relationship-health").statusCode()).isEqualTo(404)
    }

    @Test
    fun `health reports database status without exposing components`() {
        val response = get("/actuator/health", password = null)

        assertThat(response.statusCode()).isEqualTo(200)
        val health = json(response)
        assertThat(health.path("status").asString()).isEqualTo("UP")
        assertThat(health.has("components")).isFalse()
        assertThat(health.has("details")).isFalse()
    }

    @Test
    fun `reader can select companies and cannot write or inspect migrations`() {
        connect("croc_reader", readerPassword).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT COUNT(*) FROM insight.companies").use { rows ->
                    assertThat(rows.next()).isTrue()
                    assertThat(rows.getInt(1)).isGreaterThanOrEqualTo(2)
                }
                val write = assertThrows<SQLException> {
                    statement.executeUpdate("UPDATE insight.companies SET name = name WHERE false")
                }
                assertThat(write.sqlState).isEqualTo("42501")
                val history = assertThrows<SQLException> {
                    statement.executeQuery("SELECT * FROM insight.flyway_schema_history")
                }
                assertThat(history.sqlState).isEqualTo("42501")
            }
        }
    }

    @Test
    fun `schema rejects edges with an endpoint outside the initiative`() {
        val statement = """
            INSERT INTO insight.relationships (id, initiative_id, source_contact_id, target_contact_id, type, label)
            VALUES (gen_random_uuid(), '$modernization', '$marina', '$otherCompanyPerson', 'COORDINATION', 'Проверка')
        """.trimIndent()
        assertRejectedByForeignKey(statement)
    }

    @Test
    fun `schema rejects participation with a contact in another company`() {
        val statement = """
            INSERT INTO insight.initiative_participants (initiative_id, company_id, contact_id)
            VALUES ('$modernization', '$northernLine', '$otherCompanyPerson')
        """.trimIndent()
        assertRejectedByForeignKey(statement)
    }

    @Test
    fun `demo endpoints require credentials and reject writes and other actuator endpoints`() {
        assertThat(get("/api/v1/companies", password = null).statusCode()).isEqualTo(401)
        assertThat(get("/api/v1/companies", password = "incorrect").statusCode()).isEqualTo(401)
        assertThat(request("/api/v1/companies", apiPassword, "POST").statusCode()).isEqualTo(403)
        assertThat(get("/actuator/env").statusCode()).isEqualTo(403)
    }

    @Test
    fun `catalog shows only accessible companies and initiatives`() {
        val companies = read("/api/v1/companies")
        assertThat(companies.stringValues("name"))
            .containsExactly("Северная линия", "Меридиан")
        val initiatives = read("/api/v1/companies/$northernLine/initiatives")
        assertThat(initiatives.stringValues("name"))
            .containsExactly("Модернизация инфраструктуры", "Пилот защиты данных")
        assertThat(get("/api/v1/companies/$privateCompany/initiatives").statusCode()).isEqualTo(404)
        assertThat(get("/api/v1/initiatives/$privateInitiative/graph").statusCode()).isEqualTo(404)
    }

    @Test
    fun `graph keeps contact identity across initiatives and renders directed edges`() {
        val original = read("/api/v1/initiatives/$modernization/graph")
        val other = read("/api/v1/initiatives/$dataProtection/graph")
        assertThat(original.path("asOf").asString()).isEqualTo("2026-11-24T09:00:00Z")
        assertThat(original.path("nodes").size()).isEqualTo(4)
        assertThat(original.path("edges").size()).isEqualTo(2)
        val firstEdge = original.path("edges").get(0)
        assertThat(firstEdge.path("source").asString()).isEqualTo(itDirector)
        assertThat(firstEdge.path("target").asString()).isEqualTo(marina)
        assertThat(original.path("edges").get(1).path("confirmed").asBoolean()).isFalse()
        val originalPerson = original.path("nodes").first { it.path("id").asString() == marina }
        val otherPerson = other.path("nodes").first { it.path("id").asString() == marina }
        assertThat(originalPerson.path("jobTitle").asString()).isEqualTo("Финансовый директор")
        assertThat(otherPerson.path("jobTitle")).isEqualTo(originalPerson.path("jobTitle"))
        assertThat(originalPerson.path("role").path("code").asString()).isEqualTo("BUDGET_APPROVER")
        assertThat(otherPerson.path("role").path("code").asString()).isEqualTo("CONSULTANT")
        assertThat(original.path("nodes").get(3).path("role").isNull).isTrue()
        assertThat(original.path("nodes").get(3).path("department").isNull).isTrue()
    }

    @Test
    fun `filters combine and keep only edges with both endpoints visible`() {
        val path = "/api/v1/initiatives/$modernization/graph"
        val byRole = read("$path?roleCode=BUDGET_APPROVER")
        assertThat(byRole.path("nodes").stringValues("id")).containsExactly(marina)
        assertThat(byRole.path("edges").size()).isZero()
        assertThat(byRole.path("filters").path("departments").size()).isEqualTo(3)
        val byDepartment = read("$path?departmentId=$itDepartment")
        assertThat(byDepartment.path("nodes").stringValues("id")).containsExactly(itDirector)
        val both = read("$path?roleCode=BUDGET_APPROVER&departmentId=$itDepartment")
        assertThat(both.path("matchingPeople").asInt()).isZero()
        assertThat(both.path("nodes").size()).isZero()
        assertThat(both.path("edges").size()).isZero()
    }

    @Test
    fun `malformed filters and identifiers return a bad request`() {
        assertThat(get("/api/v1/initiatives/invalid/graph").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/initiatives/20000000-0-4000-8000-1/graph").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/companies/10000000-0-4000-8000-1/initiatives").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/initiatives/$modernization/graph?departmentId=invalid").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/initiatives/$modernization/graph?departmentId=").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/initiatives/$modernization/graph?departmentId=%20").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/initiatives/$modernization/graph?roleCode=invalid").statusCode()).isEqualTo(400)
    }

    @Test
    fun `dossier exposes the same contact with the role of the current initiative`() {
        val original = read("/api/v1/initiatives/$modernization/people/$marina")
        val other = read("/api/v1/initiatives/$dataProtection/people/$marina")
        assertThat(original.path("companyId").asString()).isEqualTo(northernLine)
        assertThat(original.path("initiativeId").asString()).isEqualTo(modernization)
        assertThat(original.path("asOf").asString()).isEqualTo("2026-11-24T09:00:00Z")
        assertThat(original.path("person").path("id")).isEqualTo(other.path("person").path("id"))
        assertThat(original.path("person").path("jobTitle").asString()).isEqualTo("Финансовый директор")
        assertThat(original.path("person").path("role").path("code").asString()).isEqualTo("BUDGET_APPROVER")
        assertThat(other.path("person").path("role").path("code").asString()).isEqualTo("CONSULTANT")
    }

    @Test
    fun `history paginates tied timestamps and includes the other event participants`() {
        val path = "/api/v1/initiatives/$modernization/events"
        val first = read("$path?personId=$marina&limit=1")
        assertThat(first.path("items").stringValues("id")).containsExactly(budgetEmail)
        assertThat(first.path("nextCursor").asString()).isEqualTo(budgetEmail)
        val second = read("$path?personId=$marina&limit=1&cursor=$budgetEmail")
        val meeting = second.path("items").get(0)
        assertThat(meeting.path("id").asString()).isEqualTo(budgetMeeting)
        assertThat(meeting.path("occurredAt").asString()).isEqualTo("2026-11-18T10:00:00Z")
        assertThat(meeting.path("type").asString()).isEqualTo("MEETING")
        assertThat(meeting.path("outcome").asString()).isEqualTo("Согласовали подготовку расчёта")
        assertThat(meeting.path("nextStep").asString()).isEqualTo("Предоставить расчёт затрат к 24 ноября")
        assertThat(meeting.path("participants").stringValues("id")).containsExactly(marina, itDirector)
        assertThat(second.path("nextCursor").isNull).isTrue()
        assertThat(read(path).path("items").stringValues("id")).containsExactly(budgetEmail, budgetMeeting, securityCall)
    }

    @Test
    fun `dossier and history hide data outside the company and current initiative`() {
        assertThat(get("/api/v1/initiatives/$privateInitiative/people/$marina").statusCode()).isEqualTo(404)
        assertThat(get("/api/v1/initiatives/$privateInitiative/events").statusCode()).isEqualTo(404)
        assertThat(get("/api/v1/initiatives/$dataProtection/people/$itDirector").statusCode()).isEqualTo(404)
        assertThat(get("/api/v1/initiatives/$dataProtection/events?personId=$itDirector").statusCode()).isEqualTo(404)
        assertThat(get("/api/v1/initiatives/$modernization/events", password = null).statusCode()).isEqualTo(401)
        assertThat(get("/api/v1/initiatives/$modernization/people/$marina", password = null).statusCode()).isEqualTo(401)
    }

    @Test
    fun `history distinguishes an empty timeline from invalid pagination`() {
        val path = "/api/v1/initiatives/$modernization/events"
        val empty = read("$path?personId=$personWithoutEvents")
        assertThat(empty.path("items").isEmpty).isTrue()
        assertThat(empty.path("nextCursor").isNull).isTrue()
        assertThat(get("$path?personId=$marina&cursor=$securityCall").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/initiatives/$dataProtection/events?cursor=$budgetEmail").statusCode()).isEqualTo(400)
        assertThat(get("$path?cursor=").statusCode()).isEqualTo(400)
        assertThat(get("$path?limit=0").statusCode()).isEqualTo(400)
        assertThat(get("$path?limit=51").statusCode()).isEqualTo(400)
        assertThat(get("$path?limit=").statusCode()).isEqualTo(400)
    }

    @Test
    fun `an event cannot include a contact from a different initiative`() {
        assertRejectedByForeignKey(
            """
            INSERT INTO insight.touchpoint_participants (initiative_id, touchpoint_id, contact_id)
            VALUES ('$modernization', '$budgetMeeting', '$otherCompanyPerson')
            """.trimIndent(),
        )
        assertRejectedByForeignKey(
            """
            INSERT INTO insight.touchpoint_participants (initiative_id, touchpoint_id, contact_id)
            VALUES ('$dataProtection', '$budgetMeeting', '$marina')
            """.trimIndent(),
        )
    }

    @Test
    fun `coverage separates old touchpoints from missing history and stale verification`() {
        val path = "/api/v1/initiatives/$modernization/coverage"
        val result = read("$path?days=7")
        val contacts = result.path("contacts").associateBy { it.path("id").asString() }
        val budgetOwner = requireNotNull(contacts[marina])
        val securityLead = requireNotNull(contacts["40000000-0000-4000-8000-000000000003"])
        val unrecorded = requireNotNull(contacts[personWithoutEvents])
        assertThat(budgetOwner.path("touchStatus").asString()).isEqualTo("RECENT")
        assertThat(budgetOwner.path("verificationStatus").asString()).isEqualTo("STALE")
        assertThat(securityLead.path("touchStatus").asString()).isEqualTo("STALE")
        assertThat(securityLead.path("verificationStatus").asString()).isEqualTo("UNKNOWN")
        assertThat(unrecorded.path("touchStatus").asString()).isEqualTo("UNKNOWN")
        assertThat(unrecorded.path("lastTouchAt").isNull).isTrue()
        assertThat(result.path("departments").first { it.path("name").asString() == "ИБ" }
            .path("touchStatus").asString()).isEqualTo("STALE")
        assertThat(read("$path?days=30").path("contacts")
            .first { it.path("id").asString() == securityLead.path("id").asString() }
            .path("touchStatus").asString()).isEqualTo("RECENT")
    }

    @Test
    fun `coverage validates the observation window and hides inaccessible initiatives`() {
        val path = "/api/v1/initiatives/$modernization/coverage"
        assertThat(get("$path?days=0").statusCode()).isEqualTo(400)
        assertThat(get("$path?days=366").statusCode()).isEqualTo(400)
        assertThat(get("$path?days=").statusCode()).isEqualTo(400)
        assertThat(get(path, password = null).statusCode()).isEqualTo(401)
        assertThat(get("/api/v1/initiatives/$privateInitiative/coverage").statusCode()).isEqualTo(404)
    }

    @Test
    fun `coverage ignores future events and uses an inclusive age threshold`() {
        val data = read("/api/v1/initiatives/$dataProtection/coverage?days=7")
        val contact = data.path("contacts").first { it.path("id").asString() == marina }
        assertThat(contact.path("lastTouchAt").asString()).isEqualTo("2026-11-17T09:00:00Z")
        assertThat(contact.path("touchStatus").asString()).isEqualTo("STALE")
    }

    @Test
    fun `snapshot history excludes later events before paginating`() {
        val path = "/api/v1/initiatives/$dataProtection/events?personId=$marina&limit=1"
        val later = "60000000-0000-4000-8000-000000000099"
        assertThat(read(path).path("items").stringValues("id")).containsExactly(later)
        val through = "2026-11-24T09:00:00Z"
        val snapshot = read("$path&through=$through")
        assertThat(snapshot.path("items").stringValues("id")).containsExactly("60000000-0000-4000-8000-000000000004")
        assertThat(snapshot.path("nextCursor").isNull).isTrue()
        assertThat(get("$path&through=$through&cursor=$later").statusCode()).isEqualTo(400)
        assertThat(get("$path&through=").statusCode()).isEqualTo(400)
    }

    @Test
    fun `editor saves an auditable position and stale versions cannot overwrite it`() {
        val path = "/api/v1/initiatives/$modernization/people/$marina/demo-source"
        val initial = read(path)
        assertThat(initial.path("canEdit").asBoolean()).isFalse()
        assertThat(initial.path("version").asInt()).isEqualTo(1)
        assertThat(initial.path("position").path("stance").asString()).isEqualTo("DOUBTS")
        val writer = request(path, editorPassword, "GET", "demo-editor")
        assertThat(json(writer).path("canEdit").asBoolean()).isTrue()
        val csrf = csrf("demo-editor", editorPassword)
        preparedWriter
        val saved = patch(path, editorPassword, "demo-editor", csrf, 1, "Подтверждение на встрече")
        assertThat(saved.statusCode()).isEqualTo(200)
        assertThat(json(saved).path("version").asInt()).isEqualTo(2)
        assertThat(json(saved).path("position").path("author").asString()).isEqualTo("demo-editor")
        assertThat(patch(path, editorPassword, "demo-editor", csrf, 1, "Перезапись").statusCode()).isEqualTo(409)
        val dossier = read("/api/v1/initiatives/$modernization/people/$marina")
        assertThat(dossier.path("position").path("basis").asString()).isEqualTo("Подтверждение на встрече")
        connect("croc_writer", writerPassword).use { connection ->
            connection.createStatement().use { statement ->
                val denied = assertThrows<SQLException> {
                    statement.executeUpdate("DELETE FROM insight.stance_revisions WHERE false")
                }
                assertThat(denied.sqlState).isEqualTo("42501")
            }
        }
    }

    @Test
    fun `position writes require editor permission csrf and an accessible participation`() {
        val path = "/api/v1/initiatives/$modernization/people/$itDirector/demo-source"
        val editorToken = csrf("demo-editor", editorPassword)
        val readerToken = csrf("demo-reader", apiPassword)
        assertThat(patch(path, apiPassword, "demo-reader", readerToken, 0, "Тест").statusCode()).isEqualTo(403)
        assertThat(patch(path, editorPassword, "demo-editor", emptyMap(), 0, "Тест").statusCode()).isEqualTo(403)
        assertThat(patch(path, editorPassword, "demo-editor", editorToken, 0, " ").statusCode()).isEqualTo(400)
        assertThat(patch("/api/v1/initiatives/$privateInitiative/people/$marina/demo-source",
            editorPassword, "demo-editor", editorToken, 0, "Тест").statusCode()).isEqualTo(404)
        assertThat(read(path).path("version").asInt()).isZero()
    }

    @Test
    fun `json writes reject coerced versions and numeric stances`() {
        val path = "/api/v1/initiatives/$modernization/people/$itDirector/demo-source"
        val headers = csrf("demo-editor", editorPassword) + ("Content-Type" to "application/json")
        val invalidChanges = listOf(
            """{"stance":"SUPPORTS","basis":"Основание","expectedVersion":0.5}""",
            """{"stance":"SUPPORTS","basis":"Основание","expectedVersion":"0"}""",
            """{"stance":0,"basis":"Основание","expectedVersion":0}""",
        )
        invalidChanges.forEach { body ->
            assertThat(request(path, editorPassword, "PATCH", "demo-editor", headers, body).statusCode()).isEqualTo(400)
        }
        assertThat(read(path).path("version").asInt()).isZero()
    }

    @Test
    fun `when two editors save the same version only one revision is written`() {
        val path = "/api/v1/initiatives/$dataProtection/people/$marina/demo-source"
        val token = csrf("demo-editor", editorPassword)
        preparedWriter
        val results = listOf("Первое основание", "Второе основание").map { basis ->
            CompletableFuture.supplyAsync {
                patch(path, editorPassword, "demo-editor", token, 0, basis).statusCode()
            }
        }
        assertThat(results.map { it.join() }).containsExactlyInAnyOrder(200, 409)
        assertThat(read(path).path("version").asInt()).isEqualTo(1)
    }

    @Test
    fun `configured local navigator sends authorized facts to the selected model`() {
        val config = read("/api/v1/ai/settings")
        assertThat(config.path("enabled").asBoolean()).isTrue()
        assertThat(config.path("model").asString()).isEqualTo("fixture-local")
        assertThat(config.has("url")).isFalse()
        val headers = csrf("demo-reader", apiPassword) + ("Content-Type" to "application/json")
        val input = """{"days":7,"question":"Кого стоит проверить?"}"""
        val beforeForbidden = modelRequest.get()
        val forbidden = request("/api/v1/initiatives/$privateInitiative/ai/advice", apiPassword, "POST",
            headers = headers, body = input)
        assertThat(forbidden.statusCode()).isEqualTo(404)
        assertThat(modelRequest.get()).isSameAs(beforeForbidden)
        val response = request("/api/v1/initiatives/$modernization/ai/advice", apiPassword, "POST",
            headers = headers, body = input)
        assertThat(response.statusCode()).isEqualTo(200)
        assertThat(json(response).path("answer").asString()).isEqualTo("Проверьте основание у Марины.")
        assertThat(json(response).path("asOf")).isEqualTo(read("/api/v1/initiatives/$modernization/coverage?days=7").path("asOf"))
        val received = modelRequest.get()
        assertThat(received.path("model").asString()).isEqualTo("fixture-local")
        assertThat(received.path("messages").get(1).path("content").asString())
            .contains("Кого стоит проверить?", "Дарья Белова").doesNotContain("Закрытая компания")
    }

    @Test
    fun `local navigator rejects oversized responses and times out while receiving partial responses`() {
        val path = "/api/v1/initiatives/$modernization/ai/advice"
        val headers = csrf("demo-reader", apiPassword) + ("Content-Type" to "application/json")
        fun advise(question: String) = request(path, apiPassword, "POST", headers = headers,
            body = mapper.writeValueAsString(mapOf("days" to 7, "question" to question)))

        assertThat(advise("Длинный тестовый ответ").statusCode()).isEqualTo(502)
        assertThat(advise("Медленный тестовый ответ").statusCode()).isEqualTo(504)
        assertThat(advise("Короткий тестовый ответ").statusCode()).isEqualTo(200)
    }

    private fun csrf(user: String, password: String): Map<String, String> {
        val response = request("/api/v1/csrf", password, "GET", user)
        assertThat(response.statusCode()).isEqualTo(200)
        return mapOf(
            "Cookie" to response.headers().firstValue("Set-Cookie").orElseThrow().substringBefore(";"),
            json(response).path("headerName").asString() to json(response).path("token").asString(),
        )
    }

    private fun patch(
        path: String, password: String, user: String, headers: Map<String, String>, version: Int, basis: String,
    ): HttpResponse<String> = request(
        path, password, "PATCH", user, headers + ("Content-Type" to "application/json"),
        mapper.writeValueAsString(mapOf("stance" to "SUPPORTS", "basis" to basis, "expectedVersion" to version)),
    )

    private fun assertRejectedByForeignKey(sql: String) {
        connect("croc_migrator", migratorPassword).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { statement ->
                val failure = assertThrows<SQLException> { statement.executeUpdate(sql) }
                assertThat(failure.sqlState).isEqualTo("23503")
            }
            connection.rollback()
        }
    }

    private fun get(path: String, password: String? = apiPassword): HttpResponse<String> =
        request(path, password, "GET")

    private fun read(path: String): JsonNode {
        val response = get(path)
        assertThat(response.statusCode()).describedAs("GET $path").isEqualTo(200)
        return json(response)
    }

    private fun request(
        path: String,
        password: String?,
        method: String,
        user: String = "demo-reader",
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
    ): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path"))
            .timeout(Duration.ofSeconds(10))
            .method(method, body?.let { HttpRequest.BodyPublishers.ofString(it) } ?: HttpRequest.BodyPublishers.noBody())
        headers.forEach { (name, value) -> request.header(name, value) }
        if (password != null) {
            val credentials = Base64.getEncoder().encodeToString("$user:$password".toByteArray())
            request.header("Authorization", "Basic $credentials")
        }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun json(response: HttpResponse<String>): JsonNode = mapper.readTree(response.body())

    private fun JsonNode.stringValues(field: String): List<String> =
        iterator().asSequence().map { it.path(field).asString() }.toList()

    private fun connect(user: String, password: String): Connection =
        DriverManager.getConnection(postgres.jdbcUrl, user, password)

    companion object {
        private const val northernLine = "10000000-0000-4000-8000-000000000001"
        private const val modernization = "20000000-0000-4000-8000-000000000001"
        private const val dataProtection = "20000000-0000-4000-8000-000000000002"
        private const val itDepartment = "30000000-0000-4000-8000-000000000002"
        private const val marina = "40000000-0000-4000-8000-000000000001"
        private const val itDirector = "40000000-0000-4000-8000-000000000002"
        private const val otherCompanyPerson = "40000000-0000-4000-8000-000000000004"
        private const val personWithoutEvents = "40000000-0000-4000-8000-000000000005"
        private const val budgetMeeting = "60000000-0000-4000-8000-000000000001"
        private const val budgetEmail = "60000000-0000-4000-8000-000000000002"
        private const val securityCall = "60000000-0000-4000-8000-000000000003"
        private const val privateCompany = "10000000-0000-4000-8000-000000000099"
        private const val privateInitiative = "20000000-0000-4000-8000-000000000099"

        private val migratorPassword = UUID.randomUUID().toString()
        private val readerPassword = UUID.randomUUID().toString()
        private val apiPassword = UUID.randomUUID().toString()
        private val editorPassword = UUID.randomUUID().toString()
        private val writerPassword = UUID.randomUUID().toString()
        private val modelRequest = AtomicReference<JsonNode>()
        private val localModel by lazy {
            HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
                createContext("/v1/chat/completions") { exchange ->
                    exchange.use {
                        val request = JsonMapper.builder().build().readTree(exchange.requestBody)
                        modelRequest.set(request)
                        val question = request.path("messages").path(1).path("content").asString()
                        val response = if (question.contains("Длинный тестовый ответ")) ByteArray(65_537) { 32 }
                            else """{"choices":[{"message":{"content":"Проверьте основание у Марины."}}]}""".toByteArray()
                        exchange.responseHeaders.set("Content-Type", "application/json")
                        exchange.sendResponseHeaders(200, response.size.toLong())
                        try {
                            if (question.contains("Медленный тестовый ответ")) {
                                repeat(response.size) { index ->
                                    exchange.responseBody.write(response[index].toInt())
                                    exchange.responseBody.flush()
                                    Thread.sleep(70)
                                }
                            } else {
                                exchange.responseBody.write(response)
                            }
                        } catch (_: IOException) {
                            // клиент прекращает чтение после достижения лимита
                        }
                    }
                }
                start()
            }
        }

        @JvmStatic
        @AfterAll
        fun closeModel() = localModel.stop(0)

        private val preparedWriter by lazy {
            val result = postgres.execInContainer(
                "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "croc_insight",
                "-f", "/tmp/croc-writer.sql",
            )
            check(result.exitCode == 0) { "Writer role setup failed" }
        }

        @Container
        @JvmField
        val postgres = PostgreSQLContainer("postgres:17.12-bookworm")
            .withDatabaseName("croc_insight")
            .withUsername("postgres")
            .withPassword(UUID.randomUUID().toString())
            .withEnv("CROC_DB_MIGRATOR_PASSWORD", migratorPassword)
            .withEnv("CROC_DB_READER_PASSWORD", readerPassword)
            .withEnv("CROC_DB_WRITER_PASSWORD", writerPassword)
            .withCopyToContainer(
                MountableFile.forHostPath(Path.of("docker/postgres/bootstrap.sql").toAbsolutePath()),
                "/docker-entrypoint-initdb.d/01-bootstrap.sql",
            )
            .withCopyToContainer(
                MountableFile.forHostPath(Path.of("docker/postgres/provision-writer.sql").toAbsolutePath()),
                "/tmp/croc-writer.sql",
            )

        @JvmStatic
        @DynamicPropertySource
        fun configure(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.password") { readerPassword }
            registry.add("spring.flyway.password") { migratorPassword }
            registry.add("spring.flyway.locations") { "classpath:db/migration,classpath:db/demo,classpath:db/test" }
            registry.add("croc.demo.api-password") { apiPassword }
            registry.add("croc.demo.editor-password") { editorPassword }
            registry.add("croc.demo.writer-password") { writerPassword }
            registry.add("croc.ai.base-url") { "http://127.0.0.1:${localModel.address.port}/v1" }
            registry.add("croc.ai.model") { "fixture-local" }
            registry.add("croc.ai.request-timeout-ms") { 1_500 }
        }
    }
}
