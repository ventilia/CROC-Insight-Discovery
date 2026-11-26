\set ON_ERROR_STOP on

BEGIN;
SET LOCAL search_path TO insight, pg_catalog;
SET LOCAL TIME ZONE 'Europe/Moscow';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM company_viewers
        WHERE viewer_key = 'demo-reader' AND company_id = '10000000-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'start the backend with the demo profile before loading the showcase';
    END IF;
END
$$;

SELECT pg_advisory_xact_lock(92000000);

-- keep showcase identifiers stable across reloads
CREATE OR REPLACE FUNCTION pg_temp.showcase_id(kind integer, number integer) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT format('920000%s-0000-4000-8000-%s', lpad(kind::text, 2, '0'), lpad(number::text, 12, '0'))::uuid
$$;

CREATE OR REPLACE FUNCTION pg_temp.showcase_latin(name text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT string_agg((ARRAY['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p',
            'r','s','t','u','f','kh','ts','ch','sh','sch','','y','','e','yu','ya'])
            [strpos('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', letter)], '' ORDER BY position)
    FROM regexp_split_to_table(lower(name), '') WITH ORDINALITY AS characters(letter, position)
$$;

CREATE TEMP TABLE showcase_companies ON COMMIT DROP AS
SELECT company.*, pg_temp.showcase_id(1, number) AS id,
       CASE WHEN number = 1 THEN 540 ELSE 72 + number * 17 % 75 END AS contact_count
FROM (VALUES
    (1, 'Атлас Север', 'Транспорт и логистика', 'atlas-sever', 'Оператор мультимодальной логистики с восемью распределительными центрами. Объединяет транспортное планирование, складской учёт и диспетчеризацию в одной платформе.',
        ARRAY['Единая логистическая платформа', 'Контур складской автоматизации', 'Резервирование диспетчерских сервисов', 'Сверка тарифов перевозчиков']),
    (2, 'АгроВектор', 'Агропромышленность', 'agrovector', 'Зерновой холдинг с собственными элеваторами и парком вагонов. Координирует сезонные отгрузки и контролирует качество партий.',
        ARRAY['Управление зерновыми партиями', 'Телеметрия элеваторов', 'Учёт ремонта вагонов', 'Витрина прогноза урожайности']),
    (3, 'Арка Энергия', 'Энергетика', 'arka-energy', 'Региональная генерирующая компания. Планирует обслуживание станций и интеграцию оперативной телеметрии.',
        ARRAY['Диспетчерская модель генерации', 'Архив технологической телеметрии', 'Расчёт резервов мощности', 'Обследование подстанций']),
    (4, 'Балтийская Верфь', 'Судостроение', 'baltic-shipyard', 'Производственная площадка полного цикла. Ведёт портфель заказов на строительство и ремонт вспомогательного флота.',
        ARRAY['Контур производственных заказов', 'Цифровой альбом судна', 'Управление стапельной загрузкой', 'Трассировка поставок металла']),
    (5, 'Берест Медика', 'Медицина', 'berest-medica', 'Сеть диагностических центров с единой лабораторией. Развивает обмен результатами исследований между подразделениями.',
        ARRAY['Оркестрация лабораторных исследований', 'Архив медицинских изображений', 'Управление парком приборов', 'Маршрутизация обращений']),
    (6, 'Волна Телеком', 'Телекоммуникации', 'volna-telecom', 'Оператор связи для промышленных и жилых объектов. Обслуживает узлы доступа и магистральную сеть.',
        ARRAY['Планирование ёмкости сети', 'Контроль магистральных инцидентов', 'Аудит абонентских подключений', 'Единый каталог сетевых услуг']),
    (7, 'Гелиос Материалы', 'Строительные материалы', 'helios-materials', 'Производитель теплоизоляции с площадками в трёх регионах. Развивает лабораторный контроль и прогнозирование спроса.',
        ARRAY['Учёт качества изоляционных материалов', 'Бронирование отгрузочных окон', 'Пересмотр норм расхода сырья', 'Портал для дилеров']),
    (8, 'Городской Контур', 'Управление недвижимостью', 'gorod-kontur', 'Группа по эксплуатации коммерческих объектов. Управляет потоками заявок, подрядчиками и графиками проверок.',
        ARRAY['Диспетчеризация инженерных заявок', 'Мобильные обходы объектов', 'Контур учёта аренды', 'Энергопрофиль зданий']),
    (9, 'Дельта Платёж', 'Финансовые услуги', 'delta-payment', 'Оператор расчётной инфраструктуры для корпоративных клиентов. Обрабатывает реестры платежей и обеспечивает сверку операций.',
        ARRAY['Онлайн-сверка расчётов', 'Мониторинг платёжных очередей', 'Управление доступами партнёров', 'Миграция расчётного архива']),
    (10, 'Енисей Машины', 'Машиностроение', 'yenisei-machinery', 'Завод промышленного оборудования с сервисными подразделениями. Хранит историю ремонтов и конфигураций изделий.',
        ARRAY['Паспорт промышленного изделия', 'Прогнозирование гарантийных ремонтов', 'Прослеживаемость сборки', 'Сервисные комплекты для регионов']),
    (11, 'Заречье Маркет', 'Розничная торговля', 'zarechye-retail', 'Региональная продуктовая сеть. Сводит остатки магазинов и распределительных центров, управляет регулярными промо.',
        ARRAY['Прогноз полочных остатков', 'Верификация промо-цен', 'Импорт каталогов поставщиков', 'Очередь обновления касс']),
    (12, 'Кедровый Терминал', 'Портовая логистика', 'cedar-terminal', 'Грузовой терминал с автомобильными и железнодорожными воротами. Регулирует окна подачи и хранение грузов.',
        ARRAY['Цифровая очередь на терминале', 'Контроль контейнерной площадки', 'Отчётность по вагонным операциям', 'Планирование весовой инфраструктуры']),
    (13, 'Ладога Вода', 'ЖКХ', 'ladoga-water', 'Эксплуатирует водозаборы и очистные сооружения. Ведёт ремонты, расчёт потерь и контроль показателей воды.',
        ARRAY['Оперативная карта водопроводной сети', 'Лабораторные данные по качеству воды', 'Маршруты аварийных бригад', 'Реестр контрольных приборов']),
    (14, 'Маяк Лаб', 'Инженерные услуги', 'mayak-lab', 'Испытательный центр для промышленных партнёров. Управляет поверкой оборудования и выпуском измерительных отчётов.',
        ARRAY['Лабораторный кабинет заказчика', 'Календарь испытательных стендов', 'Аудит протоколов замеров', 'Электронный архив методик']),
    (15, 'Медная Линия', 'Металлургия', 'copper-line', 'Переработчик цветных металлов. Ведёт контроль качества плавок, загрузку цехов и планирование сырья.',
        ARRAY['Прослеживаемость плавильных партий', 'Прогноз загрузки оборудования', 'Резерв расходных материалов', 'Реестр маршрутных карт']),
    (16, 'Меридиан Холод', 'Холодовая логистика', 'meridian-cold', 'Дистрибьютор товаров с температурными ограничениями. Обслуживает парк рефрижераторов и складские камеры.',
        ARRAY['Телеметрия холодильной цепи', 'Складской контроль температур', 'Разбор претензий по доставке', 'Подключение региональных камер']),
    (17, 'Норд Строй', 'Девелопмент', 'nord-build', 'Девелопер индустриальных парков. Управляет стройплощадками и вводом инженерных коммуникаций.',
        ARRAY['Цифровое снятие объёмов работ', 'Календарь ввода объектов', 'Контур контроля подрядчиков', 'Реестр требований инспекции']),
    (18, 'Орион Мобилити', 'Городской транспорт', 'orion-mobility', 'Оператор городских маршрутов и ремонтных депо. Планирует выпуск техники и анализирует отклонения от расписания.',
        ARRAY['Прогноз срыва рейсов', 'Сервисная история транспорта', 'Аудит работы диспетчерских', 'Расписание ночных ремонтов']),
    (19, 'Полюс Связь', 'Спутниковая связь', 'polyus-communications', 'Обеспечивает удалённые промышленные площадки связью. Развивает мониторинг канальной ёмкости и технической поддержки.',
        ARRAY['Карта удалённых каналов', 'Резервный центр управления связью', 'Ревизия парка терминалов', 'Заявки на расширение покрытия']),
    (20, 'Рубеж Автоматика', 'Промышленная автоматизация', 'rubezh-automation', 'Проектирует системы сбора данных и управления для производственных линий. Поддерживает парк контроллеров и шкафов.',
        ARRAY['Реестр промышленной автоматики', 'Шаблоны удалённого обслуживания', 'Инвентаризация контроллеров', 'Лаборатория испытаний шлюзов']),
    (21, 'Саян Профиль', 'Производство', 'sayan-profile', 'Производитель фасадных и оконных систем. Планирует смены, закупает комплектующие и ведёт рекламации.',
        ARRAY['Раскладка производственных заказов', 'Управление номенклатурой профилей', 'Архив сертификационных испытаний', 'Прогноз закупки комплектующих']),
    (22, 'Тайга Данные', 'Центры обработки данных', 'taiga-data', 'Сеть площадок размещения вычислительного оборудования. Учитывает стойки, резерв мощности и регламентные работы.',
        ARRAY['Контроль мощностей ЦОД', 'Миграция систем наблюдения', 'Программа ревизии инженерных резервов', 'Согласование новых точек размещения']),
    (23, 'Урал Композит', 'Композиционные материалы', 'ural-composite', 'Поставщик композитных деталей для транспорта и энергетики. Сертифицирует материалы и отслеживает результаты испытаний.',
        ARRAY['Карта композитных компонентов', 'Сбор испытательных данных', 'Учёт оснастки и пресс-форм', 'График квалификации поставщиков']),
    (24, 'Штиль Курьер', 'Курьерские услуги', 'shtil-courier', 'Оператор доставки с собственными сортировочными площадками. Оптимизирует маршруты, возвраты и работу пунктов выдачи.',
        ARRAY['Распределение курьерских маршрутов', 'Расчёт предельной загрузки сортировки', 'Сверка причин возврата', 'Подключение новых пунктов выдачи'])
) AS company(number, name, industry, domain, description, projects);

CREATE TEMP TABLE showcase_workstreams ON COMMIT DROP AS
SELECT * FROM (VALUES
    (1, 57, 'Управление программой', 'управление программой', 'Директор по трансформации', 'Руководитель проектного офиса', ARRAY['Координатор проектного офиса', 'Куратор портфеля', 'Аналитик проектных рисков', 'Менеджер программы']),
    (2, 64, 'Архитектура и интеграция', 'архитектура интеграций', 'Главный архитектор', 'Руководитель группы интеграции', ARRAY['Архитектор решений', 'Инженер интеграции', 'Системный аналитик', 'Ведущий разработчик']),
    (3, 45, 'Финансы и контроллинг', 'бюджет и финансовая модель', 'Финансовый директор', 'Руководитель контроллинга', ARRAY['Финансовый аналитик', 'Экономист проекта', 'Специалист по бюджетированию', 'Контролёр затрат']),
    (4, 31, 'Закупки и договоры', 'закупки и договоры', 'Директор по закупкам', 'Руководитель договорной группы', ARRAY['Менеджер категории', 'Специалист по договорам', 'Координатор тендеров', 'Аналитик закупок']),
    (5, 66, 'Операционное управление', 'операционная модель', 'Операционный директор', 'Руководитель операционного центра', ARRAY['Руководитель смены', 'Операционный аналитик', 'Диспетчер', 'Инженер по процессам']),
    (6, 53, 'Цифровые продукты', 'цифровые сервисы', 'Директор по цифровым продуктам', 'Руководитель продуктовой команды', ARRAY['Владелец продукта', 'Продуктовый аналитик', 'Дизайнер сервисов', 'Менеджер внедрения']),
    (7, 35, 'Информационная безопасность', 'политика доступа и защита данных', 'Директор по информационной безопасности', 'Руководитель группы ИБ', ARRAY['Архитектор ИБ', 'Инженер мониторинга', 'Аналитик угроз', 'Специалист по управлению доступом']),
    (8, 49, 'Данные и аналитика', 'данные и отчётность', 'Директор по данным', 'Руководитель аналитической платформы', ARRAY['Инженер данных', 'Аналитик качества данных', 'Разработчик отчётности', 'Владелец набора данных']),
    (9, 30, 'Контроль качества', 'качество и приёмочные испытания', 'Директор по качеству', 'Руководитель испытаний', ARRAY['Инженер по качеству', 'Аналитик приёмки', 'Руководитель тестирования', 'Специалист внутреннего аудита']),
    (10, 44, 'Эксплуатация и поддержка', 'эксплуатация сервисов', 'Директор по эксплуатации', 'Руководитель сервисной службы', ARRAY['Дежурный инженер', 'Координатор поддержки', 'Инженер второй линии', 'Менеджер уровня сервиса']),
    (11, 39, 'Региональные подразделения', 'развёртывание в регионах', 'Директор регионального кластера', 'Руководитель регионального внедрения', ARRAY['Руководитель филиала', 'Инженер площадки', 'Координатор региона', 'Куратор обучения']),
    (12, 27, 'Правовой блок', 'нормативные требования', 'Директор по правовым вопросам', 'Руководитель правовой экспертизы', ARRAY['Юрист проекта', 'Специалист по комплаенсу', 'Эксперт по регулированию', 'Аналитик договорных рисков'])
) AS workstream(number, flagship_size, name, topic, director, deputy, jobs);

INSERT INTO companies (id, name, industry, description)
SELECT id, name, industry, description FROM showcase_companies
ON CONFLICT (id) DO NOTHING;

INSERT INTO company_viewers (viewer_key, company_id)
SELECT viewer_key, c.id
FROM showcase_companies c CROSS JOIN (VALUES ('demo-reader'), ('demo-editor')) AS viewers(viewer_key)
ON CONFLICT DO NOTHING;

INSERT INTO departments (id, company_id, name)
SELECT pg_temp.showcase_id(3, c.number * 100 + w.number), c.id, w.name
FROM showcase_companies c CROSS JOIN showcase_workstreams w
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE showcase_people ON COMMIT DROP AS
WITH names AS (
    SELECT ARRAY['Александр','Алексей','Андрей','Антон','Артём','Борис','Вадим','Валерий','Виктор','Виталий','Владимир','Вячеслав','Глеб','Григорий','Даниил','Денис','Дмитрий','Евгений','Егор','Игорь','Илья','Кирилл','Константин','Леонид','Максим','Михаил','Никита','Олег','Павел','Пётр','Роман','Семён','Сергей','Станислав','Тимофей','Юрий'] AS male,
           ARRAY['Алёна','Алина','Алла','Анастасия','Анна','Валентина','Валерия','Варвара','Вера','Виктория','Галина','Дарья','Диана','Евгения','Екатерина','Елена','Инна','Ирина','Кира','Кристина','Ксения','Лариса','Лидия','Любовь','Маргарита','Марина','Мария','Надежда','Наталья','Оксана','Ольга','Полина','Светлана','Софья','Тамара','Юлия'] AS female,
           ARRAY['Абрамов','Авдеев','Агеев','Александров','Андреев','Анисимов','Астахов','Баранов','Белов','Берестов','Блинов','Бобров','Богданов','Борисов','Васильев','Веденеев','Виноградов','Власов','Волков','Воробьёв','Воронцов','Горелов','Грачёв','Гусев','Данилов','Демидов','Денисов','Дорофеев','Егоров','Елисеев','Ермаков','Жданов','Журавлёв','Зайцев','Захаров','Зотов','Игнатьев','Калинин','Карпов','Киселёв','Ковальчук','Корнеев','Крылов','Лавров','Лапшин','Лебедев','Леонов','Макаров','Мартынов','Медведев','Мельников','Миронов','Назаров','Николаев','Овчинников','Орлов','Панин','Петров','Ракитин','Романов','Рябинин','Савельев','Сорокин','Титов','Федотов','Фомин','Чернов','Яковлев'] AS surnames
),
sizes AS (
    SELECT c.number AS company_number, c.id AS company_id, c.domain, w.*,
           CASE WHEN c.number = 1 THEN w.flagship_size
                ELSE c.contact_count / 12 + (w.number <= c.contact_count % 12)::integer END AS size
    FROM showcase_companies c CROSS JOIN showcase_workstreams w
),
sized_workstreams AS (
    SELECT sizes.*, (sum(size) OVER (PARTITION BY company_id ORDER BY number) - size)::integer AS contact_offset
    FROM sizes
)
SELECT pg_temp.showcase_id(4, w.company_number * 1000 + person.number) AS id,
       w.company_id, w.company_number, person.number, w.number AS workstream, slot.number AS workstream_slot,
       CASE WHEN person.number % 113 <> 0 THEN pg_temp.showcase_id(3, w.company_number * 100 + w.number) END AS department_id,
       concat_ws(' ', profile.first_name, profile.last_name) AS name,
       CASE WHEN slot.number = 1 THEN w.director WHEN slot.number = 2 THEN w.deputy
            WHEN person.number % 37 <> 0 THEN w.jobs[(slot.number + w.company_number) % cardinality(w.jobs) + 1] END AS job_title,
       CASE WHEN (person.number + w.company_number) % 10 < 8 THEN
           timestamptz '2026-11-24 12:00:00+03' - make_interval(days =>
               CASE WHEN (person.number * 19 + w.company_number) % 10 < 7 THEN 2 + (person.number * 7) % 81
                    ELSE 93 + (person.number * 17) % 188 END)
       END AS verified_at,
       CASE WHEN person.number % 11 NOT IN (0, 1) THEN format('%s.%s.%s@%s.example',
           pg_temp.showcase_latin(left(profile.first_name, 1)), pg_temp.showcase_latin(profile.last_name),
           person.number, w.domain) END AS email,
       CASE WHEN person.number % 5 IN (2, 3) THEN format('доб. %s', 1200 + person.number) END AS phone
FROM sized_workstreams w
CROSS JOIN LATERAL generate_series(1, w.size) AS slot(number)
CROSS JOIN LATERAL (SELECT w.contact_offset + slot.number AS number) person
CROSS JOIN names
CROSS JOIN LATERAL (
    SELECT (person.number + w.company_number) % 2 = 0 AS female,
           ((person.number - 1) / 2 + w.company_number * 7) % cardinality(names.male) + 1 AS first_name,
           (((person.number - 1) / 2) / 36 + ((person.number - 1) / 2) % 36 * 11 + w.company_number * 5)
               % cardinality(names.surnames) + 1 AS surname
) name_index
CROSS JOIN LATERAL (
    SELECT (CASE WHEN name_index.female THEN names.female ELSE names.male END)[name_index.first_name] AS first_name,
           names.surnames[name_index.surname]
               || CASE WHEN name_index.female AND names.surnames[name_index.surname] <> 'Ковальчук' THEN 'а' ELSE '' END AS last_name
) profile;

INSERT INTO contacts (id, company_id, department_id, name, job_title, verified_at, email, phone)
SELECT id, company_id, department_id, name, job_title, verified_at, email, phone FROM showcase_people
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE showcase_projects ON COMMIT DROP AS
WITH project_specs AS (
    SELECT c.id AS company_id, c.number AS company_number, p.ordinality::integer AS sequence, p.name,
           (ARRAY['ACTIVE', 'PILOT', 'ARCHIVED', 'NEW'])[p.ordinality] AS phase,
           CASE WHEN c.number = 1 THEN (ARRAY[540, 126, 89, 37])[p.ordinality]
                ELSE (ARRAY[55, 34, 27, 19])[p.ordinality] + (c.number * 7 + p.ordinality * 11)::integer % 18
           END AS size
    FROM showcase_companies c CROSS JOIN LATERAL unnest(c.projects) WITH ORDINALITY AS p(name, ordinality)
    UNION ALL
    SELECT c.id, c.number, extra.sequence, extra.name, extra.phase, extra.size
    FROM showcase_companies c
    CROSS JOIN (VALUES
        (5, 'Планирование межрегиональных перевозок', 'PILOT', 72),
        (6, 'Реестр транспортных подрядчиков', 'WATCH', 58),
        (7, 'Витрина качества данных', 'ACTIVE', 96),
        (8, 'Контур уведомлений грузополучателей', 'WATCH', 43)
    ) AS extra(sequence, name, phase, size)
    WHERE c.number = 1
)
SELECT pg_temp.showcase_id(2, company_number * 100 + sequence) AS id, company_number * 100 + sequence AS number,
       company_id, company_number, sequence, name, phase, size,
       timestamptz '2026-11-24 12:00:00+03' - make_interval(days =>
           CASE WHEN company_number = 1 AND sequence = 1 THEN 0 ELSE (company_number * 5 + sequence) % 10 END) AS as_of
FROM project_specs;

INSERT INTO initiatives (id, company_id, name, as_of)
SELECT id, company_id, name, as_of FROM showcase_projects
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE showcase_participations ON COMMIT DROP AS
WITH selected_people AS (
    SELECT i.id AS initiative_id, i.number AS initiative_number, i.company_id, i.sequence, i.phase, i.as_of,
           person.id AS contact_id, person.number, person.workstream, person.workstream_slot
    FROM showcase_projects i
    CROSS JOIN LATERAL (
        SELECT p.id, p.number, p.workstream, p.workstream_slot
        FROM showcase_people p
        WHERE p.company_id = i.company_id
        ORDER BY CASE WHEN p.workstream_slot <= 2 THEN p.workstream_slot ELSE 3 END,
                 md5(i.number::text || ':' || p.number::text)
        LIMIT i.size
    ) person
),
ranked_people AS (
    SELECT selected_people.*,
           (row_number() OVER (PARTITION BY initiative_id ORDER BY number))::integer AS slot,
           (row_number() OVER (PARTITION BY initiative_id, workstream ORDER BY workstream_slot))::integer AS cluster_slot,
           (count(*) OVER (PARTITION BY initiative_id, workstream))::integer AS cluster_size,
           (dense_rank() OVER (PARTITION BY initiative_id ORDER BY workstream))::integer AS cluster_number
    FROM selected_people
),
roles AS (
    SELECT ranked_people.*,
           CASE
               WHEN workstream = 1 AND workstream_slot = 1 THEN 'PROJECT_SPONSOR'
               WHEN workstream = 3 AND workstream_slot = 1 THEN 'BUDGET_APPROVER'
               WHEN workstream = 4 AND workstream_slot <= 2 THEN 'PROCUREMENT_LEAD'
               WHEN workstream IN (2, 7, 8, 9, 10) AND workstream_slot <= 4 THEN 'TECHNICAL_EXPERT'
               WHEN workstream IN (5, 6, 11) AND workstream_slot = 1 THEN 'PROJECT_SPONSOR'
               WHEN (number + initiative_number) % 17 = 0 THEN NULL
               WHEN workstream IN (2, 7, 8, 9, 10) AND (number + sequence) % 3 <> 0 THEN 'TECHNICAL_EXPERT'
               ELSE 'CONSULTANT'
           END AS role_code,
           (workstream_slot = 1 OR workstream_slot = 2 AND workstream IN (1, 3, 4, 5, 7, 11)) AS decision_maker,
           (slot * 23 + workstream * 17 + initiative_number * 3) % 100 AS coverage_rank
    FROM ranked_people
)
SELECT roles.*,
       max(cluster_number) OVER (PARTITION BY initiative_id) AS cluster_count,
       CASE
           WHEN phase = 'NEW' THEN 'NONE'
           WHEN phase = 'ARCHIVED' THEN CASE WHEN coverage_rank < 72 THEN 'OLD' ELSE 'NONE' END
           WHEN phase = 'WATCH' THEN CASE WHEN coverage_rank < 28 THEN 'CURRENT' WHEN coverage_rank < 75 THEN 'OLD' ELSE 'NONE' END
           WHEN phase = 'PILOT' THEN CASE WHEN coverage_rank < 42 THEN 'CURRENT' WHEN coverage_rank < 68 THEN 'OLD' ELSE 'NONE' END
           ELSE CASE WHEN coverage_rank < 61 THEN 'CURRENT' WHEN coverage_rank < 84 THEN 'OLD' ELSE 'NONE' END
       END AS coverage
FROM roles;

INSERT INTO initiative_participants (initiative_id, contact_id, company_id, role_code, decision_maker, influence, influence_basis)
SELECT p.initiative_id, p.contact_id, p.company_id, p.role_code, p.decision_maker,
       CASE WHEN p.decision_maker AND p.cluster_slot = 1 THEN 'HIGH'
            WHEN p.decision_maker OR p.role_code = 'TECHNICAL_EXPERT' OR p.cluster_slot <= 4 THEN 'MEDIUM'
            WHEN p.role_code IS NOT NULL THEN 'LOW' END,
       CASE
           WHEN p.role_code = 'BUDGET_APPROVER' THEN 'Утверждает лимит программы и перенос затрат между этапами.'
           WHEN p.role_code = 'PROCUREMENT_LEAD' THEN 'Согласует условия договора и принимает решение о запуске закупки.'
           WHEN p.role_code = 'PROJECT_SPONSOR' THEN 'Представляет программу на управляющем комитете и утверждает приоритеты.'
           WHEN p.decision_maker THEN format('Утверждает решения направления «%s» перед передачей в проектный офис.', w.name)
           WHEN p.role_code = 'TECHNICAL_EXPERT' THEN format('Готовит экспертные заключения. Область ответственности — %s.', w.topic)
           WHEN p.role_code = 'CONSULTANT' AND p.cluster_slot <= 4 THEN 'Собирает требования подразделения и участвует в приёмке.'
           WHEN p.role_code = 'CONSULTANT' THEN 'Консультирует по рабочему процессу и проверяет результат на площадке.'
       END
FROM showcase_participations p JOIN showcase_workstreams w ON w.number = p.workstream
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE showcase_links ON COMMIT DROP AS
SELECT pg_temp.showcase_id(5, s.initiative_number * 10000 + s.slot * 10 + route.kind) AS id,
       s.initiative_id, s.contact_id AS source_id, t.contact_id AS target_id,
       route.type, route.label, (s.slot + s.initiative_number + route.kind) % 7 <> 0 AS confirmed
FROM showcase_participations s
JOIN showcase_workstreams w ON w.number = s.workstream
CROSS JOIN LATERAL (
    VALUES
        (1, s.cluster_number, s.cluster_slot % s.cluster_size + 1, 'COORDINATION',
            'Синхронизирует рабочие задачи и сроки передачи результатов', s.cluster_size > 1),
        (2, s.cluster_number, CASE WHEN s.cluster_size > 2 THEN (s.cluster_slot - 1) % 2 + 1 ELSE 1 END,
            CASE WHEN s.workstream IN (3, 4) THEN 'APPROVAL' ELSE 'EXPERTISE' END,
            CASE WHEN s.workstream = 3 THEN 'Передаёт расчёт затрат на внутреннюю проверку'
                 WHEN s.workstream = 4 THEN 'Согласует комплект закупочной документации'
                 ELSE format('Выносит вопросы направления «%s» на экспертную проверку', w.name) END,
            s.cluster_slot > 2),
        (3, s.cluster_number % s.cluster_count + 1, 1, 'COORDINATION',
            'Согласует межкомандные зависимости на координационной встрече', s.cluster_slot = 1 AND s.cluster_count > 1),
        (4, (s.cluster_number + 2) % s.cluster_count + 1, 1, 'EXPERTISE',
            'Подключает смежного руководителя к обсуждению изменений',
            (s.cluster_slot = 2 OR s.cluster_slot % 17 = 0) AND s.cluster_count > 3)
) AS route(kind, target_cluster, target_slot, type, label, enabled)
JOIN showcase_participations t ON t.initiative_id = s.initiative_id
    AND t.cluster_number = route.target_cluster AND t.cluster_slot = route.target_slot
WHERE route.enabled AND s.contact_id <> t.contact_id;

INSERT INTO relationships (id, initiative_id, source_contact_id, target_contact_id, type, label, confirmed)
SELECT id, initiative_id, source_id, target_id, type, label, confirmed
FROM showcase_links
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE showcase_event_templates ON COMMIT DROP AS
SELECT * FROM (VALUES
    (1, 'MEETING', 'Контрольная встреча', 'Команда закрыла вопросы, которые оставались после проверки.', 'Подтвердить готовность и зафиксировать дату следующего этапа.', 'Ожидают письменного подтверждения владельца процесса.'),
    (2, 'CALL', 'Рабочий звонок по рискам', 'Уточнили зависимость от смежного подрядчика и сроки ответа.', 'Сверить обновлённый план с руководителем направления.', 'Риск остаётся открытым до получения оценки от смежной команды.'),
    (3, 'EMAIL', 'Согласование замечаний', 'Получены замечания к проекту решения и список обязательных изменений.', 'Передать уточнённый пакет на повторную проверку.', 'К письму приложен перечень спорных формулировок.'),
    (4, 'NOTE', 'Разбор контрольных показателей', 'Проверены фактические показатели на выборке за две недели.', 'Добавить расчёты в рабочий отчёт и согласовать порог отклонений.', 'Для повторной сверки сохранена исходная выборка.'),
    (5, 'PROPOSAL', 'Предложение по объёму работ', 'Подготовлены оценка трудозатрат и два варианта последовательности работ.', 'Получить замечания и выбрать вариант для согласования.', 'В оценке выделены зависимости от действующих договоров.'),
    (6, 'MEETING', 'Демонстрация прототипа', 'Подразделение проверило основные сценарии на тестовом контуре.', 'Собрать результаты проверки на второй площадке.', 'Доступ к стенду оставлен до завершения испытаний.'),
    (7, 'CALL', 'Интервью с владельцем процесса', 'Зафиксированы исключения из регламента и требования дежурной смены.', 'Дополнить описание процесса и обсудить исключения с командой.', 'Смещение сроков возможно в период закрытия отчётности.'),
    (8, 'EMAIL', 'Запрос исходных данных', 'Получили часть материалов и отделили открытые вопросы от подтверждённых.', 'Напомнить о недостающих выгрузках к контрольной дате.', 'Выгрузки запрошены без персональных данных.'),
    (9, 'NOTE', 'Ревизия текущего состояния', 'Собраны исходные сведения и отмечены расхождения с регламентом.', 'Проверить спорные пункты с профильной командой.', 'Расхождения внесены в журнал решений.'),
    (10, 'MEETING', 'Стартовое обследование', 'Утвердили состав рабочей группы и границы обследования.', 'Назначить отдельные интервью по критичным процессам.', 'Состав группы дополнит руководитель подразделения.'),
    (11, 'MEETING', 'Планёрка перед запуском', 'Согласованы ответственные за переключение и порядок связи во время работ.', 'Подтвердить участие дежурной смены и время запуска.', 'Резервное окно включено в календарь программы.'),
    (12, 'CALL', 'Сверка графика поставок', 'Команда подтвердила сроки готовности и потребность в резервном окне.', 'Уточнить даты у поставщика и обновить график.', 'Окно желательно сохранить до подтверждения отгрузки.'),
    (13, 'EMAIL', 'Подтверждение критериев приёмки', 'Профильная команда согласовала перечень сценариев и сроки проверки.', 'Сопоставить критерии с утверждённым объёмом работ.', 'Критичные замечания требуют подписания итогового протокола.'),
    (14, 'NOTE', 'Решение управляющего комитета', 'Решение зафиксировано с оговоркой по контрольным показателям.', 'Обновить реестр решений и назначить владельца контрольной точки.', 'К следующему комитету подготовят фактические показатели.'),
    (15, 'PROPOSAL', 'Варианты внедрения', 'Представлены последовательный запуск и пилот на одной площадке.', 'Согласовать условия пилота с затронутыми подразделениями.', 'Оценка включает работы в ночные окна.')
) AS template(number, type, subject, outcome, next_step, comment);

CREATE TEMP TABLE showcase_managers ON COMMIT DROP AS
SELECT * FROM (VALUES
    (1, 'Алина Егорова', 'Клиентская команда'),
    (2, 'Михаил Воронцов', 'Архитектура решений'),
    (3, 'Ксения Макарова', 'Проектный офис'),
    (4, 'Дмитрий Журавлёв', 'Технический консалтинг'),
    (5, 'Мария Калинина', 'Развитие клиентов'),
    (6, 'Сергей Агеев', 'Сервисное сопровождение'),
    (7, 'Наталья Фомина', 'Проектный офис'),
    (8, 'Илья Новиков', 'Архитектура решений'),
    (9, 'Вера Зайцева', 'Технический консалтинг'),
    (10, 'Роман Никитин', 'Клиентская команда'),
    (11, 'Галина Чернова', 'Сервисное сопровождение'),
    (12, 'Павел Данилов', 'Развитие клиентов')
) AS manager(number, name, team);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'initiatives'::regclass AND attname = 'next_step' AND NOT attisdropped
    ) THEN
        UPDATE initiatives i
        SET stage = coalesce(i.stage, CASE p.phase
                WHEN 'ACTIVE' THEN 'Реализация' WHEN 'PILOT' THEN 'Пилот'
                WHEN 'ARCHIVED' THEN 'Завершён' WHEN 'NEW' THEN 'Обследование' ELSE 'Согласование' END),
            owner = coalesce(i.owner, m.name),
            due = coalesce(i.due, CASE WHEN p.phase = 'ARCHIVED' THEN p.as_of::date - 14
                ELSE p.as_of::date + 12 + (p.number * 13) % 67 END),
            next_step = coalesce(i.next_step, CASE p.phase
                WHEN 'ACTIVE' THEN 'Сверить готовность подразделений и подтвердить следующий этап внедрения.'
                WHEN 'PILOT' THEN 'Согласовать с заказчиком критерии пилота и список контрольных площадок.'
                WHEN 'ARCHIVED' THEN 'Передать результаты эксплуатации ответственному за сопровождение.'
                WHEN 'NEW' THEN 'Найти владельцев процесса и назначить первую встречу по требованиям.'
                ELSE 'Уточнить ограничения и вынести план работ на согласование.' END)
        FROM showcase_projects p
        JOIN showcase_managers m ON m.number = (p.number * 7) % 12 + 1
        WHERE i.id = p.id AND (i.stage IS NULL OR i.owner IS NULL OR i.due IS NULL OR i.next_step IS NULL);
    END IF;
END
$$;

-- keep recent and historical meeting groups distinct
CREATE TEMP TABLE showcase_event_contacts ON COMMIT DROP AS
SELECT p.*,
       (row_number() OVER (PARTITION BY initiative_id, workstream, coverage ORDER BY cluster_slot))::integer AS peer_slot,
       (count(*) OVER (PARTITION BY initiative_id, workstream, coverage))::integer AS peer_count
FROM showcase_participations p
WHERE p.coverage <> 'NONE';

CREATE TEMP TABLE showcase_events ON COMMIT DROP AS
WITH appointments AS (
    SELECT p.*, h.sequence AS event_sequence,
           CASE
               WHEN h.sequence = 0 THEN -(1 + p.slot % 9)
               WHEN p.coverage = 'CURRENT' THEN 1 + (p.slot * 7 + p.initiative_number) % 27
               ELSE 34 + (p.slot * 17 + p.initiative_number) % 167
           END + greatest(h.sequence - 1, 0) * (14 + p.slot * 13 % 23) AS days_ago
    FROM showcase_event_contacts p
    CROSS JOIN LATERAL generate_series(
        CASE WHEN p.coverage = 'CURRENT' AND p.phase = 'ACTIVE' AND p.slot % 83 = 0 THEN 0 ELSE 1 END,
        CASE
            WHEN p.coverage = 'CURRENT' AND p.phase = 'ACTIVE' THEN 5 + (p.slot + p.workstream) % 6
            WHEN p.coverage = 'CURRENT' THEN 3 + (p.slot + p.workstream) % 5
            WHEN p.phase = 'ARCHIVED' THEN 2 + (p.slot + p.workstream) % 6
            ELSE 1 + (p.slot + p.workstream) % 5
        END
    ) AS h(sequence)
)
SELECT pg_temp.showcase_id(6, a.initiative_number * 100000 + a.slot * 100 + a.event_sequence) AS id,
       a.initiative_id, a.contact_id, a.workstream, a.coverage, a.peer_slot, a.peer_count, a.slot,
       e.type, timing.occurred_at, m.team, format('%s · %s', e.subject, w.topic) AS subject,
       CASE WHEN a.event_sequence > 0 AND (a.slot + a.event_sequence) % 9 <> 0 THEN e.outcome END AS outcome,
       CASE WHEN (a.slot + a.event_sequence) % 7 <> 0 THEN e.next_step END AS next_step,
       CASE e.type WHEN 'EMAIL' THEN 'Корпоративная переписка'
                   WHEN 'NOTE' THEN 'Журнал решений'
                   WHEN 'PROPOSAL' THEN 'Реестр предложений'
                   ELSE 'Журнал взаимодействий' END AS source_label,
       CASE WHEN (a.slot + a.event_sequence) % 29 <> 0 THEN m.name END AS responsible_manager,
       CASE WHEN (a.slot + a.event_sequence) % 5 IN (0, 2) THEN e.comment END AS comment,
       CASE WHEN (a.slot + a.event_sequence) % 13 <> 0 THEN 'showcase-import' END AS created_by,
       CASE WHEN (a.slot + a.event_sequence) % 13 <> 0 THEN
           CASE WHEN a.event_sequence = 0 THEN a.as_of - interval '2 hours'
                ELSE timing.occurred_at + make_interval(mins => 40 + (a.slot * 11 + a.event_sequence) % 1310) END
       END AS created_at
FROM appointments a
JOIN showcase_workstreams w ON w.number = a.workstream
JOIN showcase_event_templates e ON e.number = CASE
    WHEN a.event_sequence = 0 THEN 11
    WHEN a.event_sequence >= 8 THEN 7 + (a.event_sequence + a.slot) % 4
    ELSE (a.slot * 7 + a.event_sequence * 11 + a.workstream) % 15 + 1 END
JOIN showcase_managers m ON m.number = (a.workstream + a.initiative_number +
    CASE WHEN a.event_sequence % 3 = 0 THEN a.slot % 7 ELSE 0 END) % 12 + 1
CROSS JOIN LATERAL (
    SELECT a.as_of - make_interval(days => a.days_ago, hours => (a.slot * 3 + a.event_sequence) % 8 - 4,
                                 mins => ((a.slot + a.event_sequence) % 4) * 15) AS occurred_at
) timing;

INSERT INTO touchpoints (id, initiative_id, type, occurred_at, team, subject, outcome, next_step, source_label,
                         responsible_manager, created_by, comment, created_at)
SELECT id, initiative_id, type, occurred_at, team, subject, outcome, next_step, source_label,
       responsible_manager, created_by, comment, created_at
FROM showcase_events
ON CONFLICT (id) DO NOTHING;

INSERT INTO touchpoint_participants (initiative_id, touchpoint_id, contact_id)
SELECT e.initiative_id, e.id, e.contact_id
FROM showcase_events e
UNION ALL
SELECT e.initiative_id, e.id, p.contact_id
FROM showcase_events e
CROSS JOIN LATERAL (VALUES
    (1, e.type IN ('MEETING', 'CALL', 'PROPOSAL') AND e.peer_count > 1),
    (2, e.type = 'MEETING' AND e.peer_count > 2 AND e.slot % 4 = 0),
    (3, e.type = 'MEETING' AND e.peer_count > 3 AND e.slot % 11 = 0)
) AS guest(slot_offset, invited)
JOIN showcase_event_contacts p ON p.initiative_id = e.initiative_id AND p.workstream = e.workstream
    AND p.coverage = e.coverage AND p.peer_slot = (e.peer_slot - 1 + guest.slot_offset) % e.peer_count + 1
WHERE guest.invited
ON CONFLICT DO NOTHING;

WITH stance_templates AS (
    SELECT * FROM (VALUES
        (1, 'SUPPORTS', 'Поддерживает пилот после проверки расчётов и согласования состава команды.'),
        (2, 'DOUBTS', 'Просит подтвердить готовность площадок и оценить нагрузку на операционную команду.'),
        (3, 'NEUTRAL', 'Ожидает результаты обследования перед тем, как сформулировать позицию.'),
        (4, 'OPPOSES', 'Возражает против запуска в предложенное окно из-за пересечения с плановыми работами.'),
        (5, 'SUPPORTS', 'Готов выделить специалистов подразделения на контрольные испытания.'),
        (6, 'DOUBTS', 'Предлагает сократить объём первого этапа до согласования критериев приёмки.'),
        (7, 'NEUTRAL', 'Просит учесть требования смежной службы и вынести решение на следующую встречу.'),
        (8, 'SUPPORTS', 'Подтвердил интерес после демонстрации перехода на новый процесс.')
    ) AS template(number, stance, basis)
)
INSERT INTO stance_revisions (initiative_id, contact_id, version, stance, basis, changed_by, changed_at)
SELECT p.initiative_id, p.contact_id, revision.version, s.stance, s.basis, 'showcase-import',
       p.as_of - make_interval(days => CASE WHEN p.coverage = 'CURRENT' THEN 4 + p.slot % 19 ELSE 49 + p.slot % 113 END
                               + (history.depth - revision.version) * (19 + p.slot % 21))
FROM showcase_event_contacts p
CROSS JOIN LATERAL (
    SELECT CASE WHEN p.decision_maker THEN 2 + p.coverage_rank % 3 ELSE 1 + p.coverage_rank % 2 END AS depth
) history
CROSS JOIN LATERAL generate_series(1, history.depth) AS revision(version)
JOIN stance_templates s ON s.number = (p.slot * 7 + p.initiative_number + revision.version * 5) % 8 + 1
WHERE p.decision_maker OR (p.slot + p.initiative_number) % 7 = 0
ON CONFLICT (initiative_id, contact_id, version) DO NOTHING;

SELECT (SELECT count(*) FROM showcase_companies) AS companies,
       (SELECT count(*) FROM showcase_projects) AS initiatives,
       (SELECT count(*) FROM showcase_people) AS contacts,
       (SELECT count(*) FROM showcase_participations) AS participations,
       (SELECT count(*) FROM showcase_links) AS relationships,
       (SELECT count(*) FROM showcase_events) AS events;

ANALYZE companies, company_viewers, departments, contacts, initiatives,
        initiative_participants, relationships, touchpoints, touchpoint_participants;

COMMIT;
