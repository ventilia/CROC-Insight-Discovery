\set ON_ERROR_STOP on

BEGIN;
SET LOCAL search_path TO insight, pg_catalog;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM company_viewers
        WHERE viewer_key = 'demo-reader' AND company_id = '10000000-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'start the backend with the demo profile before loading this dataset';
    END IF;
END
$$;

CREATE FUNCTION pg_temp.demo_id(kind int, number int) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT format('910000%s-0000-4000-8000-%s', lpad(kind::text, 2, '0'), lpad(number::text, 12, '0'))::uuid
$$;

CREATE TEMP TABLE fixture_companies ON COMMIT DROP AS
SELECT number, pg_temp.demo_id(1, number) AS id, 'Синтетика · ' || name AS name
FROM unnest(ARRAY['Альтаир', 'Вектор Север', 'Городская сеть', 'Дельта Контур', 'Кедровый порт', 'Линия Восхода',
    'Маяк Технологии', 'Облако Рубеж', 'Полярный узел', 'Речной терминал', 'Спектр Логистика', 'Тихая орбита'])
    WITH ORDINALITY AS names(name, index)
CROSS JOIN LATERAL (SELECT index::int AS number) AS ordinal;

CREATE TEMP TABLE fixture_initiatives ON COMMIT DROP AS
SELECT c.number AS company_number, c.id AS company_id, c.number * 10 + i.scenario AS number, i.scenario,
       pg_temp.demo_id(2, c.number * 10 + i.scenario) AS id, i.name,
       timestamptz '2026-11-24 09:00:00+00' AS as_of,
       CASE WHEN c.number = 1 AND i.scenario = 1 THEN 64 ELSE 32 END AS size
FROM fixture_companies c
CROSS JOIN (VALUES
    (1, 'Модернизация платформы · смешанный охват'),
    (2, 'Внедрение сервиса · активные связи'),
    (3, 'Архивная программа · давние связи'),
    (4, 'Новая инициатива · без касаний')
) AS i(scenario, name);

INSERT INTO companies (id, name)
SELECT id, name FROM fixture_companies
ON CONFLICT (id) DO NOTHING;

INSERT INTO company_viewers (viewer_key, company_id)
SELECT viewer_key, c.id
FROM fixture_companies c CROSS JOIN (VALUES ('demo-reader'), ('demo-editor')) AS viewers(viewer_key)
WHERE c.number < 12
ON CONFLICT DO NOTHING;

INSERT INTO departments (id, company_id, name)
SELECT pg_temp.demo_id(3, c.number * 100 + d.number), c.id, d.name
FROM fixture_companies c
CROSS JOIN (VALUES (1, 'ИТ'), (2, 'Финансы'), (3, 'ИБ'), (4, 'Закупки'), (5, 'Операции'), (6, 'Развитие')) AS d(number, name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO contacts (id, company_id, department_id, name, job_title, verified_at)
SELECT pg_temp.demo_id(4, c.number * 100 + n.number), c.id,
       CASE WHEN n.number % 13 <> 0 THEN pg_temp.demo_id(3, c.number * 100 + (n.number - 1) % 6 + 1) END,
       format('%s %s', names.first_names[(n.number - 1) % 8 + 1], names.last_names[(n.number - 1) / 8 + 1]),
       CASE WHEN n.number % 17 <> 0 THEN
           (ARRAY['Архитектор', 'Руководитель направления', 'Аналитик', 'Менеджер проекта',
                  'Эксперт по внедрению', 'Специалист отдела'])[(n.number - 1) % 6 + 1]
       END,
       CASE WHEN n.number % 7 <> 0 THEN timestamptz '2026-11-24 09:00:00+00' -
           make_interval(days => CASE WHEN n.number % 3 = 0 THEN 110 + n.number % 20 ELSE 4 + n.number % 60 END)
       END
FROM fixture_companies c
CROSS JOIN generate_series(1, 64) AS n(number)
CROSS JOIN (VALUES (
    ARRAY['Алексей','Денис','Илья','Кирилл','Максим','Олег','Павел','Роман'],
    ARRAY['Астахов','Берестов','Веденеев','Горелов','Дроздов','Лавров','Мельников','Рябинин']
)) AS names(first_names, last_names)
ON CONFLICT (id) DO NOTHING;

INSERT INTO initiatives (id, company_id, name, as_of)
SELECT id, company_id, name, as_of FROM fixture_initiatives
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE fixture_members ON COMMIT DROP AS
SELECT i.id AS initiative_id, i.number AS initiative_number, i.company_id, n.slot,
       pg_temp.demo_id(4, i.company_number * 100 + ((n.slot - 1 + (i.scenario - 1) * 11) % 64 + 1)) AS contact_id,
       CASE WHEN n.slot % 9 <> 0 THEN
           (ARRAY['BUDGET_APPROVER', 'PROJECT_SPONSOR', 'TECHNICAL_EXPERT', 'CONSULTANT', 'PROCUREMENT_LEAD'])
               [(n.slot - 1) % 5 + 1]
       END AS role_code,
       (n.slot - 1) % 5 IN (0, 1) AND n.slot % 9 <> 0 AS decision_maker
FROM fixture_initiatives i CROSS JOIN LATERAL generate_series(1, i.size) AS n(slot);

INSERT INTO initiative_participants (initiative_id, contact_id, company_id, role_code, decision_maker)
SELECT initiative_id, contact_id, company_id, role_code, decision_maker FROM fixture_members
ON CONFLICT DO NOTHING;

INSERT INTO relationships (id, initiative_id, source_contact_id, target_contact_id, type, label, confirmed)
SELECT pg_temp.demo_id(5, i.number * 1000 + a.slot * 10 + e.variant), i.id, a.contact_id, b.contact_id,
       e.type, e.label, (a.slot + e.variant) % 4 <> 0
FROM fixture_initiatives i
JOIN fixture_members a ON a.initiative_id = i.id
CROSS JOIN (VALUES (1, 1, 'COORDINATION', 'Координирует рабочую группу'),
                   (2, 7, 'APPROVAL', 'Согласует решение перед запуском')) AS e(variant, offset_slots, type, label)
JOIN fixture_members b ON b.initiative_id = i.id AND b.slot = (a.slot - 1 + e.offset_slots) % i.size + 1
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE fixture_events ON COMMIT DROP AS
SELECT i.id AS initiative_id, pg_temp.demo_id(6, i.number * 1000 + event.number) AS id, event.number,
       i.as_of - make_interval(days => CASE
           WHEN i.scenario = 1 AND event.number = 360 THEN -1
           WHEN i.scenario = 1 AND event.number % 2 = 0 THEN 1 + (event.number / 2) % 12
           WHEN i.scenario = 1 THEN 115 + (event.number / 2) % 90
           WHEN i.scenario = 2 THEN 1 + (event.number / 3) % 22
           ELSE 115 + (event.number / 3) % 110
       END) AS occurred_at,
       CASE WHEN i.scenario = 1 AND event.number % 2 <> 0 THEN i.size / 2 ELSE 0 END AS pool_offset,
       CASE WHEN i.scenario <> 1 THEN i.size WHEN event.number % 2 = 0 THEN i.size / 2 ELSE i.size / 4 END AS pool_size,
       CASE WHEN i.scenario = 1 THEN event.number / 2 ELSE event.number END AS participant_seed
FROM fixture_initiatives i
CROSS JOIN generate_series(1, 360) AS event(number)
WHERE i.scenario <> 4;

INSERT INTO touchpoints (id, initiative_id, type, occurred_at, team, subject, outcome, next_step, source_label)
SELECT id, initiative_id, (ARRAY['MEETING', 'CALL', 'EMAIL', 'NOTE'])[(number - 1) % 4 + 1], occurred_at,
       (ARRAY['Проектный офис', 'Пресейл', 'Архитектура', 'Сервис'])[(number - 1) % 4 + 1],
       format('%s · %s', (ARRAY['Уточнение требований', 'Обсуждение пилота', 'Согласование объёма', 'Проверка решения',
                                 'Рабочая встреча', 'Сверка рисков'])[(number - 1) % 6 + 1], number),
       CASE WHEN number % 4 <> 0 THEN 'Собрали комментарии по синтетическому сценарию' END,
       CASE WHEN number % 5 <> 0 THEN 'Уточнить условия на следующей встрече' END,
       'Синтетический набор КРОК Insight'
FROM fixture_events
ON CONFLICT (id) DO NOTHING;

INSERT INTO touchpoint_participants (initiative_id, touchpoint_id, contact_id)
SELECT e.initiative_id, e.id, m.contact_id
FROM fixture_events e
CROSS JOIN (VALUES (0), (3)) AS p(offset_slots)
JOIN fixture_members m ON m.initiative_id = e.initiative_id
    AND m.slot = e.pool_offset + (e.participant_seed + p.offset_slots) % e.pool_size + 1
ON CONFLICT DO NOTHING;

INSERT INTO stance_revisions (initiative_id, contact_id, version, stance, basis, changed_by, changed_at)
SELECT m.initiative_id, m.contact_id, versions.version,
       (ARRAY['SUPPORTS', 'DOUBTS', 'NEUTRAL', 'OPPOSES'])[(m.slot + versions.version - 2) % 4 + 1],
       CASE versions.version WHEN 1 THEN 'Первичная позиция в синтетическом сценарии'
                             ELSE 'Позиция уточнена по результатам демовстречи' END,
       'synthetic-demo', i.as_of - make_interval(days => 28 - versions.version * 7)
FROM fixture_members m
JOIN fixture_initiatives i ON i.id = m.initiative_id
CROSS JOIN (VALUES (1), (2)) AS versions(version)
WHERE i.scenario <> 4 AND m.decision_maker
ON CONFLICT (initiative_id, contact_id, version) DO NOTHING;

SELECT (SELECT count(*) FROM fixture_companies) AS companies,
       (SELECT count(*) FROM fixture_initiatives) AS initiatives,
       (SELECT count(*) FROM fixture_members) AS participations,
       (SELECT count(*) FROM fixture_events) AS events;

COMMIT;
