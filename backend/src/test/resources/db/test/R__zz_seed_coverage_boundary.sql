UPDATE touchpoints
SET occurred_at = '2026-11-17T09:00:00Z'
WHERE id = '60000000-0000-4000-8000-000000000004';

INSERT INTO touchpoints (id, initiative_id, type, occurred_at, team, subject)
VALUES ('60000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000002',
    'CALL', '2026-11-25T09:00:00Z', 'Продажи', 'Событие после среза');

INSERT INTO touchpoint_participants (initiative_id, touchpoint_id, contact_id)
VALUES ('20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000099',
    '40000000-0000-4000-8000-000000000001');
