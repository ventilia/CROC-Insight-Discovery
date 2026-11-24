INSERT INTO companies (id, name) VALUES
    ('10000000-0000-4000-8000-000000000099', 'Закрытая компания');

INSERT INTO company_viewers (viewer_key, company_id) VALUES
    ('another-reader', '10000000-0000-4000-8000-000000000099');

INSERT INTO initiatives (id, company_id, name, as_of) VALUES
    ('20000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099',
        'Закрытая инициатива', '2026-11-24T09:00:00Z');
