package ru.croc.insight.directory

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.security.Principal
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

data class ContactSearchHit(
    val id: UUID, val name: String, val jobTitle: String?, val companyId: UUID, val companyName: String,
)

@RestController
class ContactSearchController(private val jdbc: JdbcClient) {
    @GetMapping("/api/v1/contacts/search")
    fun search(@RequestParam @NotBlank @Size(max = 120) q: String, principal: Principal): List<ContactSearchHit> =
        jdbc.sql(
            """
            SELECT p.id, p.name, p.job_title, c.id AS company_id, c.name AS company_name
            FROM company_viewers v
            JOIN companies c ON c.id = v.company_id
            JOIN contacts p ON p.company_id = c.id
            WHERE v.viewer_key = :viewer AND (
                strpos(lower(p.name), lower(:query)) > 0
                OR strpos(lower(p.job_title), lower(:query)) > 0
                OR strpos(lower(p.email), lower(:query)) > 0
            )
            ORDER BY lower(p.name), p.id
            LIMIT 5
            """.trimIndent(),
        ).param("viewer", principal.name).param("query", q.trim()).query { row, _ ->
            ContactSearchHit(
                row.getObject("id", UUID::class.java), row.getString("name"), row.getString("job_title"),
                row.getObject("company_id", UUID::class.java), row.getString("company_name"),
            )
        }.list()
}
