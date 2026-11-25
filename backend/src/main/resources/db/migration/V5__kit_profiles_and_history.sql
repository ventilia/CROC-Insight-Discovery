ALTER TABLE companies ADD COLUMN industry text;
ALTER TABLE companies ADD COLUMN description text;
ALTER TABLE contacts ADD COLUMN email text;
ALTER TABLE contacts ADD COLUMN phone text;
ALTER TABLE initiative_participants ADD COLUMN influence text CHECK (influence IN ('HIGH', 'MEDIUM', 'LOW'));
ALTER TABLE initiative_participants ADD COLUMN influence_basis text;
ALTER TABLE touchpoints ADD COLUMN responsible_manager text;
ALTER TABLE touchpoints ADD COLUMN created_by text;
ALTER TABLE touchpoints ADD COLUMN request_fingerprint text;
