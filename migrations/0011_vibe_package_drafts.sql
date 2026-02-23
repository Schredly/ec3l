DO $$ BEGIN
  CREATE TYPE "vibe_package_draft_status" AS ENUM ('draft', 'previewed', 'installed', 'discarded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "vibe_package_drafts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "project_id" varchar NOT NULL REFERENCES "projects"("id"),
  "environment_id" varchar REFERENCES "environments"("id"),
  "status" "vibe_package_draft_status" NOT NULL DEFAULT 'draft',
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "prompt" text NOT NULL,
  "package" jsonb NOT NULL,
  "checksum" text NOT NULL,
  "last_preview_diff" jsonb,
  "last_preview_errors" jsonb
);

CREATE INDEX IF NOT EXISTS "idx_vibe_package_drafts_tenant_project" ON "vibe_package_drafts" ("tenant_id", "project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vibe_package_drafts_tenant_id" ON "vibe_package_drafts" ("tenant_id", "id");
