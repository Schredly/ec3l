CREATE TABLE IF NOT EXISTS "graph_package_installs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id"),
  "project_id" varchar NOT NULL REFERENCES "projects"("id"),
  "package_key" text NOT NULL,
  "version" text NOT NULL,
  "checksum" text NOT NULL,
  "installed_by" text,
  "installed_at" timestamp DEFAULT now() NOT NULL,
  "diff" jsonb,
  "package_contents" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_graph_pkg_installs_tenant_project" ON "graph_package_installs" ("tenant_id", "project_id");
CREATE INDEX IF NOT EXISTS "idx_graph_pkg_installs_pkg_key" ON "graph_package_installs" ("tenant_id", "project_id", "package_key");
