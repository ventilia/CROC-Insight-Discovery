\getenv writer_password CROC_DB_WRITER_PASSWORD

BEGIN;

SELECT 'CREATE ROLE croc_writer'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'croc_writer')
\gexec

ALTER ROLE croc_writer WITH LOGIN PASSWORD :'writer_password';
GRANT CONNECT ON DATABASE croc_insight TO croc_writer;
GRANT USAGE ON SCHEMA insight TO croc_writer;
GRANT SELECT ON insight.initiative_participants, insight.company_viewers TO croc_writer;
GRANT SELECT, INSERT ON insight.stance_revisions TO croc_writer;

COMMIT;
