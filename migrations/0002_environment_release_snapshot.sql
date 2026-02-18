-- 0002_environment_release_snapshot.sql
-- Refactor environment_releases from 1:1 (one release = one change) to 1:N (release snapshot of many changes).
-- Creates environment_release_changes join table, migrates existing data, updates triggers.

-- ============================================================
-- 1) Create the join table
-- ============================================================
CREATE TABLE IF NOT EXISTS "environment_release_changes" (
  "release_id" varchar NOT NULL,
  "change_id" varchar NOT NULL,
  PRIMARY KEY ("release_id", "change_id")
);

-- ============================================================
-- 2) Migrate existing data: preserve source_change_id in join table
-- ============================================================
INSERT INTO environment_release_changes (release_id, change_id)
SELECT id, source_change_id
FROM environment_releases
WHERE source_change_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3) Add new columns
-- ============================================================
ALTER TABLE "environment_releases" ADD COLUMN IF NOT EXISTS "environment_id" varchar;
ALTER TABLE "environment_releases" ADD COLUMN IF NOT EXISTS "created_by" varchar;

-- ============================================================
-- 4) Backfill environment_id from source_environment_id
-- ============================================================
UPDATE environment_releases
SET environment_id = source_environment_id
WHERE source_environment_id IS NOT NULL AND environment_id IS NULL;

-- ============================================================
-- 5) Drop FK constraints on old columns (may or may not exist)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "environment_releases"
    DROP CONSTRAINT IF EXISTS "environment_releases_source_change_id_change_records_id_fk";
EXCEPTION WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "environment_releases"
    DROP CONSTRAINT IF EXISTS "environment_releases_source_environment_id_environments_id_fk";
EXCEPTION WHEN undefined_object THEN null;
END $$;

-- ============================================================
-- 6) Drop old columns
-- ============================================================
ALTER TABLE "environment_releases" DROP COLUMN IF EXISTS "source_change_id";
ALTER TABLE "environment_releases" DROP COLUMN IF EXISTS "source_environment_id";

-- ============================================================
-- 7) Enforce NOT NULL on environment_id
--    Safe: no production rows should have NULL after backfill
--    (source_environment_id was always set for existing rows,
--     and no service endpoints existed to create releases with NULL)
-- ============================================================
ALTER TABLE "environment_releases" ALTER COLUMN "environment_id" SET NOT NULL;

-- ============================================================
-- 8) Add FK constraints
-- ============================================================
DO $$ BEGIN
  ALTER TABLE "environment_release_changes"
    ADD CONSTRAINT "fk_erc_release"
    FOREIGN KEY ("release_id") REFERENCES "environment_releases"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "environment_release_changes"
    ADD CONSTRAINT "fk_erc_change"
    FOREIGN KEY ("change_id") REFERENCES "change_records"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "environment_releases"
    ADD CONSTRAINT "fk_er_environment"
    FOREIGN KEY ("environment_id") REFERENCES "environments"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 9) Update release trigger (source_change_id removed)
--    Release is now a project-level event; change_id set to NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION log_release_created()
RETURNS trigger AS $$
DECLARE
  t_id varchar;
BEGIN
  SELECT tenant_id INTO t_id FROM projects WHERE id = NEW.project_id;

  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    t_id,
    NEW.project_id,
    NULL,
    'environment_release_created',
    jsonb_build_object('releaseId', NEW.id, 'environmentId', NEW.environment_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10) Update deployment trigger (source_change_id no longer exists on releases)
-- ============================================================
CREATE OR REPLACE FUNCTION log_environment_deployed()
RETURNS trigger AS $$
DECLARE
  t_id varchar;
BEGIN
  SELECT tenant_id INTO t_id FROM projects WHERE id = NEW.project_id;

  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    t_id,
    NEW.project_id,
    NULL,
    'environment_deployed',
    jsonb_build_object(
      'deploymentId', NEW.id,
      'environmentId', NEW.environment_id,
      'releaseId', NEW.release_id,
      'fromReleaseId', NEW.promoted_from_release_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11) Seed RBAC permission for environment release creation
-- ============================================================
INSERT INTO rbac_permissions (id, name, description)
VALUES (gen_random_uuid(), 'environment.release_create', 'Create environment release snapshots')
ON CONFLICT (name) DO NOTHING;

-- Grant to all existing Admin roles
INSERT INTO rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM rbac_roles r
CROSS JOIN rbac_permissions p
WHERE r.name = 'Admin'
  AND p.name = 'environment.release_create'
  AND NOT EXISTS (
    SELECT 1 FROM rbac_role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
