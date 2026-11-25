# Бэкенд КРОК Insight

Локальный API даёт доступ к карте ЛПР, карточкам участников и истории касаний на синтетических данных. В демобазе две компании, три инициативы, направленные связи и четыре касания. В обеих инициативах «Северной линии» есть Марина Орлова с одной должностью и разными ролями.

## Локальный запуск

Нужны JDK 21 и запущенный Docker Desktop или Docker Engine с Compose. Команды выполняются из папки `backend/`. Если в системе несколько JDK, укажи путь к JDK 21 в `JAVA_HOME` текущего терминала.

В PowerShell 7 создай локальный `.env` со случайными паролями. Если файл уже есть, команда его сохраняет.

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    'CROC_DB_ADMIN_PASSWORD', 'CROC_DB_MIGRATOR_PASSWORD', 'CROC_DB_READER_PASSWORD', 'CROC_DEMO_API_PASSWORD' |
        ForEach-Object {
            "$_=$([Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)))"
        } | Set-Content -LiteralPath '.env' -Encoding ascii
}

docker compose up -d --wait
.\gradlew.bat bootRun --args="--spring.profiles.active=demo"
```

На macOS и Linux заполни переменные из [.env.example](.env.example) своими случайными значениями и запускай `./gradlew bootRun --args='--spring.profiles.active=demo'`. Spring слушает `127.0.0.1:8080`, PostgreSQL доступен на `127.0.0.1:54329`. Для другого порта базы задай `CROC_DB_PORT` в `.env`.

В другом терминале проверь сервис. В последней команде curl запросит значение `CROC_DEMO_API_PASSWORD` из `.env`.

```powershell
curl.exe --fail-with-body http://127.0.0.1:8080/actuator/health
curl.exe --fail-with-body --user demo-reader http://127.0.0.1:8080/api/v1/companies
```

Остановить PostgreSQL можно через `docker compose stop`. Демо работает на отдельной базе `croc_insight`, а локальные пароли лежат в игнорируемом `.env`. При повторном запуске Compose используй тот же файл и профиль `demo`, поскольку роли создаются при первой инициализации тома, а Flyway хранит историю загрузки демоданных. Для запуска без демопрофиля нужна отдельная база. Начальная загрузка сохраняет уже существующие демозаписи. Чтобы поменять их в существующей базе, добавь миграцию либо используй отдельный пустой демотом.

## Для фронтенда

Бери [OpenAPI](openapi.yaml) и [готовые ответы для моков](examples/). Начни со списка компаний, запроси инициативы выбранной компании, затем отдай граф по ID инициативы.

| Запрос | Пример |
| --- | --- |
| `GET /api/v1/companies` | [Компании](examples/companies.json) |
| `GET /api/v1/companies/{companyId}/initiatives` | [Инициативы «Северной линии»](examples/initiatives.json) |
| `GET /api/v1/initiatives/{initiativeId}/graph` | [Модернизация инфраструктуры](examples/graph.json) |
| `GET /api/v1/initiatives/{initiativeId}/graph?roleCode=BUDGET_APPROVER` | [Фильтр по роли](examples/graph-budget-approver.json) |
| `GET /api/v1/initiatives/{initiativeId}/graph?roleCode=BUDGET_APPROVER&departmentId=30000000-0000-4000-8000-000000000002` | [Пустой результат](examples/graph-empty.json) |
| `GET /api/v1/initiatives/{initiativeId}/people/{personId}` | [Карточка Марины Орловой](examples/person.json) |
| `GET /api/v1/initiatives/{initiativeId}/events?personId={personId}` | [История Марины Орловой](examples/events-person.json) |
| `GET /api/v1/initiatives/{initiativeId}/events?limit=1` | [Первая страница истории инициативы](examples/events-first-page.json) |
| `GET /api/v1/initiatives/{initiativeId}/coverage?days=7` | [Охват «Северной линии»](examples/coverage.json) |

В графе `source → target` использует ID из `nodes`. В `filters` остаются все варианты для инициативы, даже при пустом результате. Неизвестные должность, отдел и роль приходят как `null`. Для вызовов из React при локальной разработке направь `/api` через Vite dev proxy. Пароль для Basic Auth можно передавать самому прокси из серверного окружения без префикса `VITE_`. JSON для моков работает без учётных данных.

Загружай карточку и историю отдельными запросами. Карточка содержит ту же структуру участника, что узел графа. Для истории всей инициативы опусти `personId`. Следующую страницу загружай с прежним фильтром и `nextCursor` из ответа. У участника без касаний история [пустая](examples/events-empty.json), ответ приходит со статусом `200`.

Охват учитывает касания выбранной инициативы до даты среза. Касание становится давним по достижении порога `days`. Свежесть контактных данных считается по дате последней проверки с отдельным порогом 90 дней. `UNKNOWN` показывает отсутствие записи в доступном срезе. Для интерфейса см. [инструкцию фронтенда](../frontend/README.md).

Оценка позиции с основанием, правка и интеграция с CRM относятся к следующим этапам.

## Проверки

```powershell
.\gradlew.bat clean build
```

Интеграционные тесты поднимают отдельный PostgreSQL через Testcontainers. Для локального API схема создаётся ролью миграций, запросы выполняются через роль с правом чтения. Проверки покрывают доступ к компаниям и участникам, фильтрацию графа, историю с одинаковыми датами и ограничения базы.
