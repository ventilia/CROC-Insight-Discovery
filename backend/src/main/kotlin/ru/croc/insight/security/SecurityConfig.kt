package ru.croc.insight.security

import jakarta.servlet.DispatcherType
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpMethod
import org.springframework.security.config.Customizer.withDefaults
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.crypto.factory.PasswordEncoderFactories
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@Configuration(proxyBeanMethods = false)
class SecurityConfig {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .csrf {
                it.csrfTokenRepository(CookieCsrfTokenRepository().apply {
                    setCookieCustomizer { cookie -> cookie.sameSite("Strict") }
                })
            }
            .authorizeHttpRequests {
                it.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                    .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                    .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/companies",
                        "/api/v1/companies/{companyId}/initiatives",
                        "/api/v1/initiatives/{initiativeId}/graph",
                        "/api/v1/initiatives/{initiativeId}/people/{personId}",
                        "/api/v1/initiatives/{initiativeId}/events",
                        "/api/v1/initiatives/{initiativeId}/coverage",
                        "/api/v1/initiatives/{initiativeId}/relationship-health",
                        "/api/v1/initiatives/{initiativeId}/people/{personId}/demo-source",
                        "/api/v1/csrf",
                        "/api/v1/ai/settings",
                        "/api/v1/capabilities",
                    ).hasRole("DEMO_READER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/initiatives/{initiativeId}/events").hasRole("DEMO_EDITOR")
                    .requestMatchers(
                        HttpMethod.POST,
                        "/api/v1/initiatives/{initiativeId}/ai/advice",
                    ).hasRole("DEMO_READER")
                    .requestMatchers(
                        HttpMethod.PATCH,
                        "/api/v1/initiatives/{initiativeId}/people/{personId}/demo-source",
                    ).hasRole("DEMO_EDITOR")
                    .anyRequest().denyAll()
            }
            .httpBasic(withDefaults())
            .build()

    @Bean
    fun passwordEncoder(): PasswordEncoder = PasswordEncoderFactories.createDelegatingPasswordEncoder()

    @Bean
    @Profile("demo")
    fun demoUsers(
        @Value("\${croc.demo.api-password}") password: String,
        @Value("\${croc.demo.editor-password:}") editorPassword: String,
        @Value("\${croc.demo.writer-password:}") writerPassword: String,
        passwordEncoder: PasswordEncoder,
    ): UserDetailsService {
        require(password.isNotBlank() && password.toByteArray().size <= 72) {
            "CROC_DEMO_API_PASSWORD must be non-empty and at most 72 bytes"
        }

        require(editorPassword.isBlank() == writerPassword.isBlank()) {
            "Set both CROC_DEMO_EDITOR_PASSWORD and CROC_DB_WRITER_PASSWORD to enable demo editing"
        }
        val reader = User.withUsername("demo-reader")
            .password(passwordEncoder.encode(password))
            .roles("DEMO_READER")
            .build()
        if (editorPassword.isBlank()) return InMemoryUserDetailsManager(reader)

        require(editorPassword != password && editorPassword.toByteArray().size <= 72) {
            "The demo editor password must differ from the reader password and be at most 72 bytes"
        }
        val editor = User.withUsername("demo-editor")
            .password(passwordEncoder.encode(editorPassword))
            .roles("DEMO_READER", "DEMO_EDITOR")
            .build()
        return InMemoryUserDetailsManager(reader, editor)
    }

    @Bean
    @Profile("!demo")
    fun emptyUsers(): UserDetailsService = InMemoryUserDetailsManager()
}

@RestController
class CsrfController {
    @GetMapping("/api/v1/csrf")
    fun csrf(token: CsrfToken): Map<String, String> =
        mapOf("headerName" to token.headerName, "token" to token.token)
}
