-- Add SLA config to record_types
ALTER TABLE record_types
  ADD COLUMN sla_config jsonb;

-- Record timer status enum
DO $$ BEGIN
  CREATE TYPE record_timer_status AS ENUM ('pending', 'breached', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Record timers table
CREATE TABLE IF NOT EXISTS "record_timers" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "record_id" varchar NOT NULL REFERENCES "record_instances"("id"),
  "type" text NOT NULL,
  "due_at" timestamp NOT NULL,
  "status" record_timer_status NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_record_timers_tenant" ON "record_timers" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_record_timers_due_at" ON "record_timers" ("due_at");
CREATE INDEX IF NOT EXISTS "idx_record_timers_status" ON "record_timers" ("status");

-- Add SLA telemetry event types
ALTER TYPE telemetry_event_type ADD VALUE IF NOT EXISTS 'record.sla.created';
ALTER TYPE telemetry_event_type ADD VALUE IF NOT EXISTS 'record.sla.breached';
