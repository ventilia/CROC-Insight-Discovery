CREATE TABLE companies (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) > 0)
);

CREATE TABLE company_viewers (
    viewer_key text NOT NULL CHECK (length(btrim(viewer_key)) > 0),
    company_id uuid NOT NULL REFERENCES companies (id),
    PRIMARY KEY (viewer_key, company_id)
);

CREATE TABLE departments (
    id uuid PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES companies (id),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    UNIQUE (company_id, id),
    UNIQUE (company_id, name)
);

CREATE TABLE contacts (
    id uuid PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES companies (id),
    department_id uuid,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    job_title text CHECK (length(btrim(job_title)) > 0),
    UNIQUE (company_id, id),
    FOREIGN KEY (company_id, department_id) REFERENCES departments (company_id, id)
);

CREATE TABLE initiatives (
    id uuid PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES companies (id),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    as_of timestamptz NOT NULL,
    UNIQUE (company_id, id)
);

CREATE TABLE participant_roles (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{0,31}$'),
    label text NOT NULL CHECK (length(btrim(label)) > 0)
);

CREATE TABLE initiative_participants (
    initiative_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role_code text REFERENCES participant_roles (code),
    decision_maker boolean NOT NULL DEFAULT false,
    PRIMARY KEY (initiative_id, contact_id),
    FOREIGN KEY (company_id, initiative_id) REFERENCES initiatives (company_id, id),
    FOREIGN KEY (company_id, contact_id) REFERENCES contacts (company_id, id)
);

CREATE TABLE relationships (
    id uuid PRIMARY KEY,
    initiative_id uuid NOT NULL,
    source_contact_id uuid NOT NULL,
    target_contact_id uuid NOT NULL,
    type text NOT NULL CHECK (type ~ '^[A-Z][A-Z0-9_]{0,31}$'),
    label text NOT NULL CHECK (length(btrim(label)) > 0),
    confirmed boolean NOT NULL DEFAULT false,
    FOREIGN KEY (initiative_id, source_contact_id)
        REFERENCES initiative_participants (initiative_id, contact_id),
    FOREIGN KEY (initiative_id, target_contact_id)
        REFERENCES initiative_participants (initiative_id, contact_id),
    UNIQUE (initiative_id, source_contact_id, target_contact_id, type),
    CHECK (source_contact_id <> target_contact_id)
);

CREATE INDEX company_viewers_company_idx ON company_viewers (company_id);
CREATE INDEX contacts_department_idx ON contacts (company_id, department_id);
CREATE INDEX participants_contact_idx ON initiative_participants (company_id, contact_id);
CREATE INDEX participants_role_idx ON initiative_participants (role_code);
CREATE INDEX relationships_target_idx ON relationships (initiative_id, target_contact_id);

GRANT SELECT ON companies, company_viewers, departments, contacts, initiatives,
    participant_roles, initiative_participants, relationships TO croc_reader;
