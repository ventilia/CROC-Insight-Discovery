package ru.croc.insight

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
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
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

    private fun request(path: String, password: String?, method: String): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path"))
            .timeout(Duration.ofSeconds(10))
            .method(method, HttpRequest.BodyPublishers.noBody())
        if (password != null) {
            val credentials = Base64.getEncoder().encodeToString("demo-reader:$password".toByteArray())
            request.header("Authorization", "Basic $credentials")
        }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun json(response: HttpResponse<String>): JsonNode = mapper.readTree(response.body())

    private fun connect(user: String, password: String): Connection =
        DriverManager.getConnection(postgres.jdbcUrl, user, password)

    companion object {
        private const val northernLine = "10000000-0000-4000-8000-000000000001"
        private const val modernization = "20000000-0000-4000-8000-000000000001"
        private const val marina = "40000000-0000-4000-8000-000000000001"
        private const val otherCompanyPerson = "40000000-0000-4000-8000-000000000004"

        private val migratorPassword = UUID.randomUUID().toString()
        private val readerPassword = UUID.randomUUID().toString()
        private val apiPassword = UUID.randomUUID().toString()

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
            registry.add("croc.demo.api-password") { apiPassword }
        }
    }
}
