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
GRANT SELECT ON insight.initiatives TO croc_writer;
GRANT UPDATE (as_of) ON insight.initiatives TO croc_writer;
GRANT SELECT, INSERT ON insight.touchpoints TO croc_writer;
GRANT INSERT ON insight.touchpoint_participants TO croc_writer;
GRANT INSERT (id, company_id, name, as_of, stage, owner, due, next_step) ON insight.initiatives TO croc_writer;
GRANT SELECT ON insight.departments, insight.contacts, insight.participant_roles, insight.relationships TO croc_writer;
GRANT INSERT (id, company_id, name) ON insight.departments TO croc_writer;
GRANT INSERT (id, company_id, department_id, name, job_title, email, phone),
    UPDATE (department_id, name, job_title, email, phone, edit_version) ON insight.contacts TO croc_writer;
GRANT INSERT (code, label) ON insight.participant_roles TO croc_writer;
GRANT INSERT (initiative_id, contact_id, company_id, role_code, decision_maker,
    influence, influence_basis, mandate, interest, source_label),
    UPDATE (role_code, decision_maker, influence, influence_basis, mandate, interest, source_label)
    ON insight.initiative_participants TO croc_writer;
GRANT INSERT (id, initiative_id, source_contact_id, target_contact_id, type, label, confirmed, source_label),
    UPDATE (source_contact_id, target_contact_id, type, label, confirmed, source_label)
    ON insight.relationships TO croc_writer;
GRANT SELECT (id, initiative_id, owner_key), INSERT (id, initiative_id, contact_id, owner_key, recipient, question),
    UPDATE (status) ON insight.information_requests TO croc_writer;

COMMIT;
