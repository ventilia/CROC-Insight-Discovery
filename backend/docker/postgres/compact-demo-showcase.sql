-- Apply after enrich-demo-showcase.sql. The database owner can still inspect and
-- enrich every source row. Application roles query the compact showcase.
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL search_path TO insight, pg_catalog;
SELECT pg_advisory_xact_lock(92000000);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM initiatives
        WHERE id = '92000002-0000-4000-8000-000000000101' AND next_step IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'load and enrich the demo showcase before applying its compact scope';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS demo_showcase_hidden (id uuid PRIMARY KEY);
GRANT SELECT ON demo_showcase_hidden TO PUBLIC;

-- Refresh in one transaction so reapplying the script never exposes a partial scope.
DELETE FROM demo_showcase_hidden;

INSERT INTO demo_showcase_hidden (id)
SELECT id FROM companies
WHERE id::text LIKE '91000001-%'
   OR (id::text LIKE '92000001-%' AND right(id::text, 12) NOT BETWEEN '000000000001' AND '000000000008');
INSERT INTO demo_showcase_hidden (id)
SELECT id FROM initiatives
WHERE id::text LIKE '92000002-%' AND company_id NOT IN (SELECT id FROM demo_showcase_hidden)
  AND right(id::text, 2) > CASE WHEN company_id = '92000001-0000-4000-8000-000000000001' THEN '04' ELSE '02' END;

-- The anchors are the original contact IDs of the program, architecture, and
-- finance directors. Keep those directors and up to six specialists per team.
-- Fixed anchors preserve identities when the original showcase is reloaded.
-- Company 5 has seven original contacts per retained team.
WITH teams(anchor) AS (
    VALUES (1001), (1058), (1122),
           (2001), (2010), (2019),
           (3001), (3012), (3023),
           (4001), (4013), (4025),
           (5001), (5008), (5015),
           (6001), (6010), (6019),
           (7001), (7011), (7021),
           (8001), (8013), (8024)
)
INSERT INTO demo_showcase_hidden (id)
SELECT c.id FROM contacts c
WHERE c.id::text LIKE '92000004-%'
  AND c.company_id NOT IN (SELECT id FROM demo_showcase_hidden)
  AND NOT EXISTS (
      SELECT 1 FROM teams t
      CROSS JOIN (VALUES (0), (2), (3), (4), (5), (6), (7)) AS slots(offset_number)
      WHERE c.id = format('92000004-0000-4000-8000-%s', lpad((t.anchor + slots.offset_number)::text, 12, '0'))::uuid
        AND (t.anchor / 1000 <> 5 OR slots.offset_number < 7)
        AND c.company_id = format('92000001-0000-4000-8000-%s', lpad((t.anchor / 1000)::text, 12, '0'))::uuid
  );

INSERT INTO demo_showcase_hidden (id)
SELECT d.id FROM departments d
WHERE d.id::text LIKE '92000003-%'
  AND d.company_id NOT IN (SELECT id FROM demo_showcase_hidden)
  AND NOT EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.company_id = d.company_id AND c.department_id = d.id
        AND c.id NOT IN (SELECT id FROM demo_showcase_hidden)
  )
UNION ALL
SELECT t.id FROM touchpoints t
JOIN initiatives i ON i.id = t.initiative_id
WHERE t.id::text LIKE '92000006-%'
  AND t.request_fingerprint IS NULL
  AND t.initiative_id NOT IN (SELECT id FROM demo_showcase_hidden)
  AND i.company_id NOT IN (SELECT id FROM demo_showcase_hidden)
  AND NOT EXISTS (
      SELECT 1 FROM touchpoint_participants p
      WHERE p.touchpoint_id = t.id AND p.contact_id NOT IN (SELECT id FROM demo_showcase_hidden)
  );

-- Apply the same visibility to existing read and write paths, including direct
-- links, project requests and the dashboard. The policies do not grant access
-- to any table: the regular role grants and company viewer checks still apply.
DO $$
DECLARE
    scoped_table record;
    predicate text;
BEGIN
    FOR scoped_table IN
        SELECT * FROM (VALUES
            ('companies', ARRAY['id']),
            ('company_viewers', ARRAY['company_id']),
            ('departments', ARRAY['company_id', 'id']),
            ('contacts', ARRAY['company_id', 'id']),
            ('initiatives', ARRAY['company_id', 'id']),
            ('initiative_participants', ARRAY['company_id', 'initiative_id', 'contact_id']),
            ('relationships', ARRAY['initiative_id', 'source_contact_id', 'target_contact_id']),
            ('touchpoints', ARRAY['initiative_id', 'id']),
            ('touchpoint_participants', ARRAY['initiative_id', 'touchpoint_id', 'contact_id']),
            ('stance_revisions', ARRAY['initiative_id', 'contact_id']),
            ('information_requests', ARRAY['initiative_id', 'contact_id'])
        ) AS scope(table_name, column_names)
    LOOP
        SELECT string_agg(
            format('NOT EXISTS (SELECT 1 FROM insight.demo_showcase_hidden h WHERE h.id = %I.%I)',
                scoped_table.table_name, column_name), ' AND ')
        INTO predicate
        FROM unnest(scoped_table.column_names) AS columns(column_name);

        -- Scope child rows of companies even when callers query the child table directly.
        IF scoped_table.table_name IN ('relationships', 'touchpoints', 'touchpoint_participants',
                'stance_revisions', 'information_requests') THEN
            predicate := predicate || format(
                ' AND EXISTS (SELECT 1 FROM insight.initiatives i WHERE i.id = %I.initiative_id)',
                scoped_table.table_name);
        END IF;

        EXECUTE format('DROP POLICY IF EXISTS compact_showcase ON insight.%I', scoped_table.table_name);
        EXECUTE format('CREATE POLICY compact_showcase ON insight.%I USING (%s)',
            scoped_table.table_name, predicate);
        EXECUTE format('ALTER TABLE insight.%I ENABLE ROW LEVEL SECURITY', scoped_table.table_name);
    END LOOP;
END
$$;

ANALYZE demo_showcase_hidden;
COMMIT;
