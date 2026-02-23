CREATE TABLE IF NOT EXISTS "vibe_package_draft_versions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "draft_id" varchar NOT NULL REFERENCES "vibe_package_drafts"("id"),
  "version_number" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" text,
  "reason" text NOT NULL,
  "package" jsonb NOT NULL,
  "checksum" text NOT NULL,
  "preview_diff" jsonb,
  "preview_errors" jsonb
);

CREATE INDEX IF NOT EXISTS "idx_vibe_draft_versions_tenant_draft" ON "vibe_package_draft_versions" ("tenant_id", "draft_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vibe_draft_versions_tenant_draft_version" ON "vibe_package_draft_versions" ("tenant_id", "draft_id", "version_number");
