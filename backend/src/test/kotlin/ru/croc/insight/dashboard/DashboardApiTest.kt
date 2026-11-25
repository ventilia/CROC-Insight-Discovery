package ru.croc.insight.dashboard

import java.net.URI
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
class DashboardApiTest(@LocalServerPort private val port: Int) {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val mapper = JsonMapper.builder().build()

    @Test
    fun `dashboard counts registered contacts once and counts active records within each visible initiative window`() {
        val sevenDays = read("/api/v1/dashboard?days=7")
        assertThat(sevenDays.path("accessibleCompanyCount").asLong()).isEqualTo(3)
        assertThat(sevenDays.path("registeredContactCount").asLong()).isEqualTo(6)
        assertThat(sevenDays.path("activeInteractionCount").asLong()).isEqualTo(2)
        assertThat(sevenDays.path("earliestAsOf").asString()).isEqualTo("2026-11-24T09:00:00Z")
        assertThat(sevenDays.path("latestAsOf").asString()).isEqualTo("2026-11-28T09:00:00Z")
        assertThat(sevenDays.path("riskCount").asLong()).isEqualTo(13)
        assertThat(sevenDays.path("risks").size()).isEqualTo(8)
        assertThat(sevenDays.path("risks").all { it.path("companyId").asString() != privateCompany }).isTrue()

        val defaults = read("/api/v1/dashboard")
        assertThat(defaults.path("days").asInt()).isEqualTo(30)
        assertThat(defaults.path("activeInteractionCount").asLong()).isEqualTo(4)
    }

    @Test
    fun `company insights distinguish historical evidence from unknown and report who holds recent engagement`() {
        val company = read("/api/v1/companies/$northernLine/insights?days=8")
        assertThat(company.path("registeredContactCount").asLong()).isEqualTo(5)
        assertThat(company.path("activeInteractionCount").asLong()).isEqualTo(3)
        assertThat(company.path("initiatives").iterator().asSequence().map { it.path("activeInteractionCount").asLong() }.toList())
            .containsExactly(2, 1)

        val risks = company.path("risks")
        assertThat(company.path("riskCount").asLong()).isEqualTo(9)
        assertThat(risks.size()).isEqualTo(9)
        val uncontacted = risks.fact("UNCONTACTED_DECISION_MAKER", dataProtection, itDirector)
        assertThat(uncontacted.path("evidenceStatus").asString()).isEqualTo("NO_EVIDENCE")
        assertThat(uncontacted.path("lastObservedAt").isNull).isTrue()
        val concentration = risks.fact("SINGLE_ENGAGED_DECISION_MAKER", dataProtection, securityLead)
        assertThat(concentration.path("evidenceStatus").asString()).isEqualTo("RECORDED")
        assertThat(concentration.path("lastObservedAt").asString()).isEqualTo("2026-11-17T09:00:00Z")
        val department = risks.fact("UNCONTACTED_DEPARTMENT", modernization, securityDepartment)
        assertThat(department.path("evidenceStatus").asString()).isEqualTo("STALE")
        assertThat(department.path("lastObservedAt").asString()).isEqualTo("2026-11-12T08:30:00Z")
        val unknown = risks.fact("UNKNOWN_CONTACT_VERIFICATION", modernization, securityLead)
        assertThat(unknown.path("evidenceStatus").asString()).isEqualTo("NO_EVIDENCE")
        assertThat(unknown.path("lastObservedAt").isNull).isTrue()
        val stale = risks.fact("STALE_CONTACT_VERIFICATION", modernization, financeLead)
        assertThat(stale.path("evidenceStatus").asString()).isEqualTo("STALE")
        assertThat(stale.path("lastObservedAt").asString()).isEqualTo("2026-08-01T09:00:00Z")
    }

    @Test
    fun `a company without initiatives has no snapshot or activity evidence`() {
        val company = read("/api/v1/companies/$emptyCompany/insights")
        assertThat(company.path("registeredContactCount").asLong()).isZero()
        assertThat(company.path("activeInteractionCount").asLong()).isZero()
        assertThat(company.path("earliestAsOf").isNull).isTrue()
        assertThat(company.path("latestAsOf").isNull).isTrue()
        assertThat(company.path("initiatives").size()).isZero()
        assertThat(company.path("risks").size()).isZero()
    }

    @Test
    fun `insights enforce reader access and validate identifiers and periods`() {
        assertThat(get("/api/v1/dashboard", authenticated = false).statusCode()).isEqualTo(401)
        assertThat(get("/api/v1/companies/$privateCompany/insights").statusCode()).isEqualTo(404)
        assertThat(get("/api/v1/companies/invalid/insights").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/dashboard?days=0").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/dashboard?days=366").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/companies/$northernLine/insights?days=").statusCode()).isEqualTo(400)
        assertThat(get("/api/v1/companies/$northernLine/insights?days=365").statusCode()).isEqualTo(200)
    }

    private fun JsonNode.fact(code: String, initiative: String, subject: String): JsonNode = single {
        it.path("code").asString() == code && it.path("initiativeId").asString() == initiative &&
            it.path("subjectId").asString() == subject
    }

    private fun read(path: String): JsonNode {
        val response = get(path)
        assertThat(response.statusCode()).isEqualTo(200)
        return mapper.readTree(response.body())
    }

    private fun get(path: String, authenticated: Boolean = true): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path")).timeout(Duration.ofSeconds(10))
        if (authenticated) request.header("Authorization", "Basic $authorization")
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    companion object {
        private const val northernLine = "10000000-0000-4000-8000-000000000001"
        private const val emptyCompany = "10000000-0000-4000-8000-000000000097"
        private const val privateCompany = "10000000-0000-4000-8000-000000000099"
        private const val modernization = "20000000-0000-4000-8000-000000000001"
        private const val dataProtection = "20000000-0000-4000-8000-000000000002"
        private const val securityDepartment = "30000000-0000-4000-8000-000000000003"
        private const val financeLead = "40000000-0000-4000-8000-000000000001"
        private const val itDirector = "40000000-0000-4000-8000-000000000002"
        private const val securityLead = "40000000-0000-4000-8000-000000000003"

        private val readerPassword = UUID.randomUUID().toString()
        private val migratorPassword = UUID.randomUUID().toString()
        private val apiPassword = UUID.randomUUID().toString()
        private val authorization = Base64.getEncoder().encodeToString("demo-reader:$apiPassword".toByteArray())

        @Container
        @JvmField
        val postgres = PostgreSQLContainer("postgres:17.12-bookworm")
            .withDatabaseName("croc_insight")
            .withUsername("postgres")
            .withPassword(UUID.randomUUID().toString())
            .withEnv("CROC_DB_READER_PASSWORD", readerPassword)
            .withEnv("CROC_DB_MIGRATOR_PASSWORD", migratorPassword)
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
            registry.add("spring.flyway.locations") {
                "classpath:db/migration,classpath:db/demo,classpath:db/test,classpath:db/dashboard-test"
            }
            registry.add("croc.demo.api-password") { apiPassword }
            registry.add("croc.demo.editor-password") { "" }
            registry.add("croc.demo.writer-password") { "" }
        }
    }
}
