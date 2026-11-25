-- Synthetic company details and explicit demo assessments; no real contact data.
UPDATE companies SET industry = 'Транспорт и логистика', description = 'Демонстрационный корпоративный клиент. Развитие инфраструктуры и защита данных.' WHERE id = '10000000-0000-4000-8000-000000000001' AND industry IS NULL;
UPDATE companies SET industry = 'Промышленность', description = 'Демонстрационный корпоративный клиент. Развитие закупочных процессов.' WHERE id = '10000000-0000-4000-8000-000000000002' AND industry IS NULL;
UPDATE contacts SET email = 'm.orlova@severnaya.example' WHERE id = '40000000-0000-4000-8000-000000000001' AND email IS NULL;
UPDATE contacts SET email = 'a.volkov@severnaya.example' WHERE id = '40000000-0000-4000-8000-000000000002' AND email IS NULL;
UPDATE contacts SET email = 'd.belova@severnaya.example' WHERE id = '40000000-0000-4000-8000-000000000003' AND email IS NULL;
UPDATE contacts SET email = 'i.nesterov@meridian.example' WHERE id = '40000000-0000-4000-8000-000000000004' AND email IS NULL;
UPDATE initiative_participants SET influence = 'HIGH', influence_basis = 'Демооценка: участвует в согласовании решения' WHERE role_code IN ('BUDGET_APPROVER', 'PROJECT_SPONSOR', 'PROCUREMENT_LEAD') AND influence IS NULL;
UPDATE initiative_participants SET influence = 'MEDIUM', influence_basis = 'Демооценка: экспертное заключение по инициативе' WHERE role_code IN ('TECHNICAL_EXPERT', 'CONSULTANT') AND influence IS NULL;
UPDATE touchpoints SET responsible_manager = 'Анна Смирнова' WHERE team = 'Продажи' AND responsible_manager IS NULL;
UPDATE touchpoints SET responsible_manager = 'Игорь Ковалёв' WHERE team = 'Проектная команда' AND responsible_manager IS NULL;
