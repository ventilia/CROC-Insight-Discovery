INSERT INTO company_viewers (viewer_key, company_id) VALUES
    ('demo-editor', '10000000-0000-4000-8000-000000000001'),
    ('demo-editor', '10000000-0000-4000-8000-000000000002')
ON CONFLICT (viewer_key, company_id) DO NOTHING;
