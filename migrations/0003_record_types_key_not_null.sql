-- 0003_record_types_key_not_null.sql
-- Harden D2 invariant: record_types.key must be NOT NULL at DB level.
-- Service layer already rejects empty/null keys at creation time,
-- so no legitimate rows should have NULL. Clean up any orphans first.

-- ============================================================
-- 1) Remove any rows with NULL key (should not exist in practice)
-- ============================================================
DELETE FROM record_types WHERE key IS NULL;

-- ============================================================
-- 2) Enforce NOT NULL constraint
-- ============================================================
ALTER TABLE record_types ALTER COLUMN key SET NOT NULL;
