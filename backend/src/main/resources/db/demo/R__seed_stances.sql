INSERT INTO stance_revisions (initiative_id, contact_id, version, stance, basis, changed_by, changed_at)
VALUES ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
    1, 'DOUBTS', 'На встрече запросила расчёт затрат до согласования бюджета пилота',
    'demo-source', '2026-11-18T10:00:00Z')
ON CONFLICT (initiative_id, contact_id, version) DO NOTHING;
