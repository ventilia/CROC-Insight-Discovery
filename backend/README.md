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

## Расширенный синтетический набор

После первого запуска бэкенда с профилем `demo` выполни из `backend/` в PowerShell 7:

```powershell
Get-Content -Raw -LiteralPath 'docker/postgres/load-demo-dataset.sql' |
    docker compose exec -T postgres psql -X -U croc_migrator -d croc_insight
```

В Bash используй `docker compose exec -T postgres psql -X -U croc_migrator -d croc_insight < docker/postgres/load-demo-dataset.sql`.

Загрузчик добавляет 12 вымышленных компаний, 48 инициатив, 768 контактов, 3 136 связей и 12 960 касаний. Компании помечены префиксом «Синтетика». Стабильные идентификаторы позволяют повторить загрузку. Исходные примеры и правки редактора сохраняются.

- «Синтетика · Альтаир» → «Модернизация платформы · смешанный охват» даёт карту на 64 участника, историю с несколькими страницами и смесь свежих, давних и отсутствующих касаний.
- «Внедрение сервиса · активные связи» и «Архивная программа · давние связи» позволяют сравнить высокий и низкий охват.
- «Новая инициатива · без касаний» даёт граф с участниками и пустую историю.
- «Синтетика · Тихая орбита» проверяет разграничение доступа. Компания загружена в БД и скрыта от обеих демоучёток.

У смешанных инициатив есть одно касание после даты среза, чтобы проверить `through` в истории. Для повторяемой демонстрации даты рассчитаны относительно фиксированного среза 24 ноября 2026 года.

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
| `GET /api/v1/initiatives/{initiativeId}/relationship-health?days=7` | [Индекс «Северной линии»](examples/relationship-health.json) |

В графе `source → target` использует ID из `nodes`. В `filters` остаются все варианты для инициативы, даже при пустом результате. Неизвестные должность, отдел и роль приходят как `null`. Для вызовов из React при локальной разработке направь `/api` через Vite dev proxy. Пароль для Basic Auth можно передавать самому прокси из серверного окружения без префикса `VITE_`. JSON для моков работает без учётных данных.

Загружай карточку и историю отдельными запросами. Карточка содержит ту же структуру участника, что узел графа. Для истории всей инициативы опусти `personId`. Следующую страницу загружай с прежним фильтром и `nextCursor` из ответа. У участника без касаний история [пустая](examples/events-empty.json), ответ приходит со статусом `200`.

Охват учитывает касания выбранной инициативы до даты среза. Касание становится давним по достижении порога `days`. Свежесть контактных данных считается по дате последней проверки с отдельным порогом 90 дней. `UNKNOWN` показывает отсутствие записи в доступном срезе. Для интерфейса см. [инструкцию фронтенда](../frontend/README.md).

Индекс использует тот же срез. Вес недавних касаний ЛПР составляет 50, охвата подразделений — 30, свежести данных ЛПР — 20. Для каждого показателя API отдаёт общее количество, недавние и неизвестные записи. Для расчёта нужна хотя бы одна известная давность по каждому показателю. При `INSUFFICIENT_DATA` покажи «Недостаточно данных», при `PARTIAL` покажи балл с пометкой о неполноте. Фильтры таблицы и графа на индекс не влияют.

## Правка в тестовом источнике

После первого запуска с миграцией V4 выполни `.\prepare-demo-editor.ps1` в PowerShell 7. Скрипт подготовит роль PostgreSQL с правом добавлять версии, создаст при необходимости локальные пароли редактора и сохранит их в `.env`. Затем перезапусти Spring Boot и Vite. На Linux или macOS можно задать `CROC_DEMO_EDITOR_PASSWORD` и `CROC_DB_WRITER_PASSWORD` в `.env`, экспортировать только `CROC_DB_WRITER_PASSWORD` в терминал и выполнить `docker compose exec -T -e CROC_DB_WRITER_PASSWORD postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d croc_insight < docker/postgres/provision-writer.sql`.

В карточке участника открой тестовый источник. Он отдаёт позицию, основание и номер версии. При сохранении отправь текущую версию в `expectedVersion` и CSRF-токен вместе с cookie. Сервер определит автора и добавит новую версию. Если запись изменилась, получишь `409` и сможешь перечитать её. В существующей карточке доступна последняя позиция. [Пример источника](examples/position-source.json)

Для подключения корпоративной CRM потребуется отдельный адаптер.

## Локальный навигатор

Запусти совместимый с OpenAI Chat Completions сервер на той же машине, где работает Spring Boot. В локальный `.env` добавь адрес его API и точное имя загруженной локальной модели. Для Ollama это может выглядеть так:

```dotenv
CROC_LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
CROC_LOCAL_AI_MODEL=qwen2.5:7b
```

Для LM Studio обычно используется порт `1234`. Перезапусти Spring Boot, открой «Навигатор» на экране детектора и задай вопрос. По запросу сервер отправляет локальной модели вопрос и ограниченный набор фактов доступной инициативы. В примере факты берутся из синтетической базы. Настройки адреса и модели хранятся на сервере. На получение всего ответа отводится 45 секунд. Для медленной модели задай `CROC_LOCAL_AI_TIMEOUT_MS` до 120000 мс. [Ollama](https://docs.ollama.com/api/openai-compatibility) · [LM Studio](https://lmstudio.ai/docs/developer/openai-compat)

## Проверки

```powershell
.\gradlew.bat clean build
```

Интеграционные тесты поднимают отдельный PostgreSQL через Testcontainers. Проверки покрывают разграничение доступа, фильтры графа, историю, расчёт охвата и ограничения базы. Записи проверяются на конфликт версий и доступ редактора. Навигатор проверяется с тестовым HTTP-сервером на loopback, включая таймаут и ограничение размера ответа.
