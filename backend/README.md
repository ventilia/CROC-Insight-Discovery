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

## KIT: профили и сохранение взаимодействий

Миграция V5 добавляет отрасль и описание компании, email/телефон контакта, оценку влияния с основанием в рамках инициативы, ответственного менеджера и автора события. Неизвестные значения остаются `null`. Дополнительный демосид содержит только синтетические сведения и домены `.example`.

`GET /api/v1/capabilities` сообщает режим источника и `canCreateEvents`. Для `POST /api/v1/initiatives/{initiativeId}/events` нужны роль `DEMO_EDITOR`, cookie и CSRF-заголовок, полученные через `/api/v1/csrf`. Тело и ответы описаны в `openapi.yaml`. Клиент передаёт уникальный UUID события; повтор того же запроса возвращает тот же ID без второй записи, повтор с другим содержимым — `409`. Проверяются доступ к компании, принадлежность участников инициативе, длина полей и дата в прошлом. Событие и список участников сохраняются одной транзакцией; срез инициативы сдвигается к текущему времени, чтобы новое касание учитывалось в охвате. Автор берётся из аутентификации; ответственный менеджер — отдельное поле формы.

После V5 повторно выполните подготовку роли через `prepare-demo-editor.ps1` или `docker/postgres/provision-writer.sql`, чтобы выдать `croc_writer` права INSERT на историю и UPDATE только колонки `initiatives.as_of`. У читателя права записи не появляются. Новый интеграционный тест проверяет доступ редактора, CSRF, принадлежность участников и идемпотентность.

Для запуска полного интерфейса без Java и Docker предусмотрен отдельный [локальный SQLite-демосервер](../frontend/README.md). Он хранит только демонстрационные данные и не заменяет корпоративную аутентификацию Spring Boot.
