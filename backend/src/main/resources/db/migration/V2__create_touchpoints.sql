CREATE TABLE touchpoints (
    id uuid PRIMARY KEY,
    initiative_id uuid NOT NULL REFERENCES initiatives (id),
    type text NOT NULL CHECK (type ~ '^[A-Z][A-Z0-9_]{0,31}$'),
    occurred_at timestamptz NOT NULL,
    team text NOT NULL CHECK (length(btrim(team)) > 0),
    subject text NOT NULL CHECK (length(btrim(subject)) > 0),
    outcome text,
    next_step text,
    source_label text,
    UNIQUE (initiative_id, id)
);

CREATE TABLE touchpoint_participants (
    initiative_id uuid NOT NULL,
    touchpoint_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    PRIMARY KEY (initiative_id, touchpoint_id, contact_id),
    FOREIGN KEY (initiative_id, touchpoint_id) REFERENCES touchpoints (initiative_id, id),
    FOREIGN KEY (initiative_id, contact_id) REFERENCES initiative_participants (initiative_id, contact_id)
);

CREATE INDEX touchpoints_history_idx ON touchpoints (initiative_id, occurred_at DESC, id DESC);
CREATE INDEX touchpoint_participants_contact_idx
    ON touchpoint_participants (initiative_id, contact_id, touchpoint_id);

GRANT SELECT ON touchpoints, touchpoint_participants TO croc_reader;
