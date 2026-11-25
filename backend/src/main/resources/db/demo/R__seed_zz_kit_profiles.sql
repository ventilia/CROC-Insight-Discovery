UPDATE companies SET industry = 'Транспорт и логистика', description = 'Демонстрационный корпоративный клиент. Развитие инфраструктуры и защита данных.' WHERE id = '10000000-0000-4000-8000-000000000001' AND industry IS NULL;
UPDATE companies SET industry = 'Промышленность', description = 'Демонстрационный корпоративный клиент. Развитие закупочных процессов.' WHERE id = '10000000-0000-4000-8000-000000000002' AND industry IS NULL;
UPDATE contacts SET email = 'm.orlova@severnaya.example' WHERE id = '40000000-0000-4000-8000-000000000001' AND email IS NULL;
UPDATE contacts SET email = 'a.volkov@severnaya.example' WHERE id = '40000000-0000-4000-8000-000000000002' AND email IS NULL;
UPDATE contacts SET email = 'd.belova@severnaya.example' WHERE id = '40000000-0000-4000-8000-000000000003' AND email IS NULL;
UPDATE contacts SET email = 'i.nesterov@meridian.example' WHERE id = '40000000-0000-4000-8000-000000000004' AND email IS NULL;
UPDATE contacts SET phone = 'доб. 1201' WHERE id = '40000000-0000-4000-8000-000000000001' AND phone IS NULL;

UPDATE initiative_participants AS p
SET influence = CASE WHEN p.role_code IN ('BUDGET_APPROVER', 'PROJECT_SPONSOR', 'PROCUREMENT_LEAD') THEN 'HIGH' ELSE 'MEDIUM' END,
    influence_basis = 'Оценка в базовом демонстрационном сценарии'
WHERE p.initiative_id IN ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003') AND p.influence IS NULL
  AND p.role_code IN ('BUDGET_APPROVER', 'PROJECT_SPONSOR', 'PROCUREMENT_LEAD', 'TECHNICAL_EXPERT', 'CONSULTANT');

UPDATE touchpoints
SET responsible_manager = CASE team WHEN 'Продажи' THEN 'Анна Смирнова' ELSE 'Игорь Ковалёв' END
WHERE id IN ('60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004')
  AND team IN ('Продажи', 'Проектная команда') AND responsible_manager IS NULL;
