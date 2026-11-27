import org.springframework.boot.gradle.plugin.SpringBootPlugin

plugins {
    kotlin("jvm") version "2.4.21"
    kotlin("plugin.spring") version "2.4.21"
    id("org.springframework.boot") version "4.2.0"
}

group = "ru.croc.insight"
version = "0.1.0-SNAPSHOT"

kotlin {
    jvmToolchain(21)

    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict", "-Xemit-jvm-type-annotations")
    }
}

repositories {
    mavenCentral()
}

val showcaseScripts = listOf("load", "enrich", "compact")
    .map { layout.projectDirectory.file("docker/postgres/$it-demo-showcase.sql") }
val showcaseMigration = layout.buildDirectory.file("generated/showcase/R__seed_kit_showcase.sql")

val generateShowcaseMigration by tasks.registering {
    inputs.files(showcaseScripts)
    outputs.file(showcaseMigration)
    doLast {
        val sql = showcaseScripts.joinToString("\n\n") { script ->
            script.asFile.readLines(Charsets.UTF_8)
                .filterNot { line -> line.startsWith("\\set ") || line == "BEGIN;" || line == "COMMIT;" }
                .joinToString("\n")
        }
        showcaseMigration.get().asFile.apply {
            parentFile.mkdirs()
            writeText(sql, Charsets.UTF_8)
        }
    }
}

tasks.processResources {
    dependsOn(generateShowcaseMigration)
    from(showcaseMigration) { into("db/showcase") }
}

dependencies {
    implementation(platform(SpringBootPlugin.BOM_COORDINATES))
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("tools.jackson.module:jackson-module-kotlin")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
}
