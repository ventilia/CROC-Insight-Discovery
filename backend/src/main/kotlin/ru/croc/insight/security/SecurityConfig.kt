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

@Configuration(proxyBeanMethods = false)
class SecurityConfig {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
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
                    ).hasRole("DEMO_READER")
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
        passwordEncoder: PasswordEncoder,
    ): UserDetailsService {
        require(password.isNotBlank() && password.toByteArray().size <= 72) {
            "CROC_DEMO_API_PASSWORD must be non-empty and at most 72 bytes"
        }

        return InMemoryUserDetailsManager(
            User.withUsername("demo-reader")
                .password(passwordEncoder.encode(password))
                .roles("DEMO_READER")
                .build(),
        )
    }

    @Bean
    @Profile("!demo")
    fun emptyUsers(): UserDetailsService = InMemoryUserDetailsManager()
}
