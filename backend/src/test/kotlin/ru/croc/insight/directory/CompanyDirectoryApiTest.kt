package ru.croc.insight.directory

import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Path
import java.time.Duration
import java.util.Base64
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
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
class CompanyDirectoryApiTest(@LocalServerPort private val port: Int) {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val mapper = JsonMapper.builder().build()

    @Test
    fun `company and individual profiles preserve initiative assignments and company visibility`() {
        val company = read(companyPath)
        assertThat(company.path("contactCount").asInt()).isEqualTo(4)
        assertThat(company.path("industry").asString()).isEqualTo("Транспорт и логистика")
        assertThat(company.path("departments").valuesOf("name")).containsExactlyInAnyOrder("Финансы", "ИТ", "ИБ")
        assertThat(company.path("initiatives").valuesOf("id")).containsExactly(modernization, dataProtection)

        val contact = read("$companyPath/contacts/$marina")
        assertThat(contact.path("email").asString()).isEqualTo("m.orlova@severnaya.example")
        assertThat(contact.path("assignments").valuesOf("influence")).containsExactly("HIGH", "MEDIUM")
        val roleCodes = contact.path("assignments").iterator().asSequence()
            .map { it.path("role").path("code").asString() }.toList()
        assertThat(roleCodes)
            .containsExactly("BUDGET_APPROVER", "CONSULTANT")
        assertThat(contact.path("connections").valuesOf("direction")).containsOnly("INCOMING")
        assertThat(contact.path("connections").valuesOf("initiativeId")).containsExactly(modernization, dataProtection)

        assertThat(get("$companyPath/contacts/$otherCompanyContact").statusCode()).isEqualTo(404)
        for (endpoint in listOf("", "/contacts", "/contacts/$marina", "/graph")) {
            assertThat(get("/api/v1/companies/$privateCompany$endpoint").statusCode()).isEqualTo(404)
        }
    }

    @Test
    fun `directory paginates unique contacts and filters assessed roles and historical touchpoints`() {
        val page = read("$companyPath/contacts?limit=1")
        val next = read("$companyPath/contacts?limit=1&offset=1")
        assertThat(page.path("total").asInt()).isEqualTo(4)
        assertThat(next.path("total").asInt()).isEqualTo(4)
        assertThat(page.path("items").valuesOf("id")).doesNotContainAnyElementsOf(next.path("items").valuesOf("id"))

        val matching = read("$companyPath/contacts?q=${encode("ОРЛОВА")}&roleCode=CONSULTANT&influence=MEDIUM")
        assertThat(matching.path("items").valuesOf("id")).containsExactly(marina)
        assertThat(read("$companyPath/contacts?roleCode=CONSULTANT&influence=HIGH").path("items").size()).isZero()
        val touched = read("$companyPath/contacts?responsibleManager=${encode("АННА СМИРНОВА")}&days=7&interaction=RECENT")
        val marinaRow = touched.path("items").first { it.path("id").asString() == marina }
        assertThat(marinaRow.path("lastInteractionAt").asString()).isEqualTo("2026-11-18T10:00:00Z")
        val earlierManager = read("$companyPath/contacts?responsibleManager=${encode("Игорь Ковалёв")}")
        val marinaWithEarlierManager = earlierManager.path("items").first { it.path("id").asString() == marina }
        assertThat(marinaWithEarlierManager.path("responsibleManager").asString()).isEqualTo("Анна Смирнова")
        val unknown = read("$companyPath/contacts?interaction=UNKNOWN&influence=UNKNOWN")
        assertThat(unknown.path("items").valuesOf("id")).containsExactly(personWithoutEvents)
        assertThat(unknown.path("items").get(0).path("lastInteractionAt").isNull).isTrue()

        assertThat(get("$companyPath/contacts?days=0").statusCode()).isEqualTo(400)
        assertThat(get("$companyPath/contacts?limit=101").statusCode()).isEqualTo(400)
        assertThat(get("$companyPath/contacts?offset=-1").statusCode()).isEqualTo(400)
        assertThat(get("$companyPath/contacts?departmentId=1-1-1-1-1").statusCode()).isEqualTo(400)
        assertThat(get("$companyPath/contacts?interaction=OTHER").statusCode()).isEqualTo(400)
    }

    @Test
    fun `company graph keeps directed initiative edges between unique visible people`() {
        val graph = read("$companyPath/graph")
        assertThat(graph.path("nodes").valuesOf("id")).hasSize(4).doesNotHaveDuplicates()
        val nodes = graph.path("nodes").valuesOf("id").toSet()
        val edges = graph.path("edges")
        assertThat(edges.valuesOf("initiativeId")).containsExactly(modernization, modernization, dataProtection)
        assertThat(edges.valuesOf("source") + edges.valuesOf("target")).allMatch { it in nodes }
        assertThat(edges.get(0).path("target").asString()).isEqualTo(marina)

        val filtered = read("$companyPath/graph?roleCode=CONSULTANT")
        assertThat(filtered.path("nodes").valuesOf("id")).containsExactly(marina)
        assertThat(filtered.path("edges").size()).isZero()
    }

    private fun read(path: String): JsonNode {
        val response = get(path)
        assertThat(response.statusCode()).describedAs("GET $path: ${response.body()}").isEqualTo(200)
        return mapper.readTree(response.body())
    }

    private fun get(path: String): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path"))
            .timeout(Duration.ofSeconds(10))
            .header("Authorization", "Basic $credentials")
            .GET()
            .build()
        return client.send(request, HttpResponse.BodyHandlers.ofString())
    }

    private fun JsonNode.valuesOf(field: String): List<String> =
        iterator().asSequence().map { it.path(field).asString() }.toList()

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8)

    companion object {
        private const val companyPath = "/api/v1/companies/10000000-0000-4000-8000-000000000001"
        private const val privateCompany = "10000000-0000-4000-8000-000000000099"
        private const val modernization = "20000000-0000-4000-8000-000000000001"
        private const val dataProtection = "20000000-0000-4000-8000-000000000002"
        private const val marina = "40000000-0000-4000-8000-000000000001"
        private const val otherCompanyContact = "40000000-0000-4000-8000-000000000004"
        private const val personWithoutEvents = "40000000-0000-4000-8000-000000000005"

        private val migratorPassword = UUID.randomUUID().toString()
        private val readerPassword = UUID.randomUUID().toString()
        private val apiPassword = UUID.randomUUID().toString()
        private val credentials = Base64.getEncoder().encodeToString("demo-reader:$apiPassword".toByteArray())

        @Container
        @JvmField
        val postgres = PostgreSQLContainer("postgres:17.12-bookworm")
            .withDatabaseName("croc_insight")
            .withUsername("postgres")
            .withPassword(UUID.randomUUID().toString())
            .withEnv("CROC_DB_MIGRATOR_PASSWORD", migratorPassword)
            .withEnv("CROC_DB_READER_PASSWORD", readerPassword)
            .withCopyToContainer(
                MountableFile.forHostPath(Path.of("docker/postgres/bootstrap.sql").toAbsolutePath()),
                "/docker-entrypoint-initdb.d/01-bootstrap.sql",
            )

        @JvmStatic
        @DynamicPropertySource
        fun configure(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.password") { readerPassword }
            registry.add("spring.flyway.password") { migratorPassword }
            registry.add("spring.flyway.locations") { "classpath:db/migration,classpath:db/demo,classpath:db/test" }
            registry.add("croc.demo.api-password") { apiPassword }
            registry.add("croc.demo.editor-password") { "" }
            registry.add("croc.demo.writer-password") { "" }
            registry.add("croc.ai.base-url") { "" }
            registry.add("croc.ai.model") { "" }
        }
    }
}
