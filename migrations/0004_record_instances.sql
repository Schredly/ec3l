CREATE TABLE IF NOT EXISTS "record_instances" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "record_type_id" varchar NOT NULL REFERENCES "record_types"("id"),
  "data" jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_record_instances_tenant" ON "record_instances" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_record_instances_record_type" ON "record_instances" ("record_type_id");
