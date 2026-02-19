-- Add assignment fields to record_instances
ALTER TABLE record_instances
  ADD COLUMN assigned_to text,
  ADD COLUMN assigned_group text;

CREATE INDEX IF NOT EXISTS "idx_record_instances_assigned_to" ON "record_instances" ("assigned_to");

-- Add assignment config to record_types
ALTER TABLE record_types
  ADD COLUMN assignment_config jsonb;

-- Add record.assigned telemetry event type
ALTER TYPE telemetry_event_type ADD VALUE IF NOT EXISTS 'record.assigned';
