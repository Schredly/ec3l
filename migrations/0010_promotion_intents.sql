DO $$ BEGIN
  CREATE TYPE "promotion_intent_status" AS ENUM ('draft', 'previewed', 'approved', 'executed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "promotion_intents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "project_id" varchar NOT NULL REFERENCES "projects"("id"),
  "from_environment_id" varchar NOT NULL REFERENCES "environments"("id"),
  "to_environment_id" varchar NOT NULL REFERENCES "environments"("id"),
  "status" "promotion_intent_status" NOT NULL DEFAULT 'draft',
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "approved_by" text,
  "approved_at" timestamp,
  "diff" jsonb,
  "result" jsonb
);

CREATE INDEX IF NOT EXISTS "idx_promotion_intents_tenant"
  ON "promotion_intents" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_promotion_intents_tenant_project"
  ON "promotion_intents" ("tenant_id", "project_id");

ALTER TABLE "environments"
  ADD COLUMN IF NOT EXISTS "requires_promotion_approval" boolean NOT NULL DEFAULT false;
