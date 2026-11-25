ALTER TABLE touchpoints ADD COLUMN comment text CHECK (char_length(comment) <= 2000);
ALTER TABLE touchpoints ADD COLUMN created_at timestamptz;

CREATE INDEX touchpoints_manager_history_idx ON touchpoints (initiative_id, responsible_manager, occurred_at DESC, id DESC)
    WHERE responsible_manager IS NOT NULL;
CREATE INDEX touchpoint_participants_event_idx ON touchpoint_participants (touchpoint_id, contact_id);
