package ru.croc.insight

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class InsightApplication

fun main(args: Array<String>) {
    runApplication<InsightApplication>(*args)
}
