ALTER TABLE initiatives
    ADD COLUMN stage text,
    ADD COLUMN owner text,
    ADD COLUMN due date,
    ADD COLUMN next_step text;

ALTER TABLE contacts ADD COLUMN edit_version integer NOT NULL DEFAULT 0 CHECK (edit_version >= 0);

ALTER TABLE initiative_participants
    ADD COLUMN mandate text,
    ADD COLUMN interest text,
    ADD COLUMN source_label text;

ALTER TABLE relationships ADD COLUMN source_label text;

CREATE UNIQUE INDEX relationships_label_key ON relationships
    (initiative_id, source_contact_id, target_contact_id, type, lower(btrim(label)));
ALTER TABLE relationships DROP CONSTRAINT relationships_initiative_id_source_contact_id_target_contac_key;

CREATE TABLE information_requests (
    id uuid PRIMARY KEY,
    initiative_id uuid NOT NULL REFERENCES initiatives (id),
    contact_id uuid,
    owner_key text NOT NULL CHECK (length(btrim(owner_key)) > 0),
    recipient text NOT NULL CHECK (length(btrim(recipient)) > 0),
    question text NOT NULL CHECK (length(btrim(question)) > 0),
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'DONE')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (initiative_id, contact_id) REFERENCES initiative_participants (initiative_id, contact_id)
);

CREATE INDEX information_requests_owner_idx ON information_requests
    (initiative_id, owner_key, created_at DESC, id);

GRANT SELECT ON information_requests TO croc_reader;
