-- 0001_change_events_and_promotions.sql

-- 1) Event log types + table
DO $$ BEGIN
  CREATE TYPE "public"."change_event_type" AS ENUM(
    'change_status_changed',
    'change_target_added',
    'change_target_deleted',
    'patch_op_added',
    'patch_op_deleted',
    'environment_release_created',
    'environment_deployed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "change_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL,
  "project_id" varchar NOT NULL,
  "change_id" varchar,
  "event_type" "change_event_type" NOT NULL,
  "payload" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_change_events_project" ON "change_events" ("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_change_events_change" ON "change_events" ("change_id", "created_at");

-- 2) Enforce deterministic Change state transitions at DB level
CREATE OR REPLACE FUNCTION enforce_change_status_transition()
RETURNS trigger AS $$
DECLARE
  allowed boolean := false;
BEGIN
  -- Only enforce when status actually changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Allowed transitions (must match your service state machine)
  allowed := (
    (OLD.status = 'Draft' AND NEW.status IN ('Implementing')) OR
    (OLD.status = 'Implementing' AND NEW.status IN ('WorkspaceRunning','Validating','Draft')) OR
    (OLD.status = 'WorkspaceRunning' AND NEW.status IN ('Validating','Implementing')) OR
    (OLD.status = 'Validating' AND NEW.status IN ('Ready','ValidationFailed')) OR
    (OLD.status = 'ValidationFailed' AND NEW.status IN ('Implementing','Validating')) OR
    (OLD.status = 'Ready' AND NEW.status IN ('Merged')) OR
    (OLD.status = 'Merged' AND false)
  );

  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid change status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_change_status_transition ON change_records;
CREATE TRIGGER trg_enforce_change_status_transition
BEFORE UPDATE OF status ON change_records
FOR EACH ROW
EXECUTE FUNCTION enforce_change_status_transition();

-- 3) Log change status events (DB-owned audit trail)
CREATE OR REPLACE FUNCTION log_change_status_event()
RETURNS trigger AS $$
DECLARE
  t_id varchar;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO t_id FROM projects WHERE id = NEW.project_id;

  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    t_id,
    NEW.project_id,
    NEW.id,
    'change_status_changed',
    jsonb_build_object('from', OLD.status, 'to', NEW.status)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_change_status_event ON change_records;
CREATE TRIGGER trg_log_change_status_event
AFTER UPDATE OF status ON change_records
FOR EACH ROW
EXECUTE FUNCTION log_change_status_event();

-- 4) Log change targets added/deleted
CREATE OR REPLACE FUNCTION log_change_target_added()
RETURNS trigger AS $$
BEGIN
  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    NEW.tenant_id,
    NEW.project_id,
    NEW.change_id,
    'change_target_added',
    jsonb_build_object('targetId', NEW.id, 'type', NEW.type, 'selector', NEW.selector)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_change_target_added ON change_targets;
CREATE TRIGGER trg_log_change_target_added
AFTER INSERT ON change_targets
FOR EACH ROW
EXECUTE FUNCTION log_change_target_added();

CREATE OR REPLACE FUNCTION log_change_target_deleted()
RETURNS trigger AS $$
BEGIN
  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    OLD.tenant_id,
    OLD.project_id,
    OLD.change_id,
    'change_target_deleted',
    jsonb_build_object('targetId', OLD.id, 'type', OLD.type)
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_change_target_deleted ON change_targets;
CREATE TRIGGER trg_log_change_target_deleted
AFTER DELETE ON change_targets
FOR EACH ROW
EXECUTE FUNCTION log_change_target_deleted();

-- 5) Log patch ops added/deleted
CREATE OR REPLACE FUNCTION log_patch_op_added()
RETURNS trigger AS $$
DECLARE
  proj_id varchar;
BEGIN
  -- project_id is in change_targets
  SELECT project_id INTO proj_id FROM change_targets WHERE id = NEW.target_id;

  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    NEW.tenant_id,
    proj_id,
    NEW.change_id,
    'patch_op_added',
    jsonb_build_object('opId', NEW.id, 'targetId', NEW.target_id, 'opType', NEW.op_type)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_patch_op_added ON change_patch_ops;
CREATE TRIGGER trg_log_patch_op_added
AFTER INSERT ON change_patch_ops
FOR EACH ROW
EXECUTE FUNCTION log_patch_op_added();

CREATE OR REPLACE FUNCTION log_patch_op_deleted()
RETURNS trigger AS $$
DECLARE
  proj_id varchar;
BEGIN
  SELECT project_id INTO proj_id FROM change_targets WHERE id = OLD.target_id;

  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    OLD.tenant_id,
    proj_id,
    OLD.change_id,
    'patch_op_deleted',
    jsonb_build_object('opId', OLD.id, 'targetId', OLD.target_id, 'opType', OLD.op_type)
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_patch_op_deleted ON change_patch_ops;
CREATE TRIGGER trg_log_patch_op_deleted
AFTER DELETE ON change_patch_ops
FOR EACH ROW
EXECUTE FUNCTION log_patch_op_deleted();

-- ============================================================
-- 2) Environment promotion primitive (release + deployment)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "public"."environment_release_status" AS ENUM('created');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "environment_releases" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL,
  "source_change_id" varchar NOT NULL,
  "source_environment_id" varchar,
  "status" "environment_release_status" DEFAULT 'created' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_env_releases_project" ON "environment_releases" ("project_id", "created_at");

CREATE TABLE IF NOT EXISTS "environment_deployments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL,
  "environment_id" varchar NOT NULL,
  "release_id" varchar NOT NULL,
  "promoted_from_release_id" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_env_deployments_env" ON "environment_deployments" ("environment_id", "created_at");

-- Log release creation and deployments into change_events
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
    NEW.source_change_id,
    'environment_release_created',
    jsonb_build_object('releaseId', NEW.id, 'sourceEnvironmentId', NEW.source_environment_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_release_created ON environment_releases;
CREATE TRIGGER trg_log_release_created
AFTER INSERT ON environment_releases
FOR EACH ROW
EXECUTE FUNCTION log_release_created();

CREATE OR REPLACE FUNCTION log_environment_deployed()
RETURNS trigger AS $$
DECLARE
  t_id varchar;
  src_change_id varchar;
BEGIN
  SELECT tenant_id INTO t_id FROM projects WHERE id = NEW.project_id;
  SELECT source_change_id INTO src_change_id FROM environment_releases WHERE id = NEW.release_id;

  INSERT INTO change_events(tenant_id, project_id, change_id, event_type, payload)
  VALUES (
    t_id,
    NEW.project_id,
    src_change_id,
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

DROP TRIGGER IF EXISTS trg_log_environment_deployed ON environment_deployments;
CREATE TRIGGER trg_log_environment_deployed
AFTER INSERT ON environment_deployments
FOR EACH ROW
EXECUTE FUNCTION log_environment_deployed();
