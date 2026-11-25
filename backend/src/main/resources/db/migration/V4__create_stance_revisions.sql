CREATE TABLE stance_revisions (
    initiative_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    stance text NOT NULL CHECK (stance IN ('SUPPORTS', 'NEUTRAL', 'DOUBTS', 'OPPOSES')),
    basis text NOT NULL CHECK (length(btrim(basis)) BETWEEN 1 AND 1200),
    changed_by text NOT NULL CHECK (length(btrim(changed_by)) > 0),
    changed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (initiative_id, contact_id, version),
    FOREIGN KEY (initiative_id, contact_id) REFERENCES initiative_participants (initiative_id, contact_id)
);

GRANT SELECT ON stance_revisions TO croc_reader;
