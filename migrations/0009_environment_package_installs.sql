CREATE TABLE IF NOT EXISTS "environment_package_installs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "project_id" varchar NOT NULL REFERENCES "projects"("id"),
  "environment_id" varchar NOT NULL REFERENCES "environments"("id"),
  "package_key" text NOT NULL,
  "version" text NOT NULL,
  "checksum" text NOT NULL,
  "installed_by" text,
  "installed_at" timestamp DEFAULT now() NOT NULL,
  "source" text NOT NULL,
  "diff" jsonb,
  "package_contents" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_env_pkg_installs_tenant_env"
  ON "environment_package_installs" ("tenant_id", "environment_id");
CREATE INDEX IF NOT EXISTS "idx_env_pkg_installs_env_pkg_key"
  ON "environment_package_installs" ("tenant_id", "environment_id", "package_key");
