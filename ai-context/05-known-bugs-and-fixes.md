# 05 — Known Bugs and Fixes

This document records bugs that were discovered and fixed, their root causes, and the architectural lessons they produced.

---

## Bug 1: Snapshot project_id was null or derived from wrong source

**Commit:** `49aded2`

**Symptom:**
`record_type_snapshots.project_id` was either null or populated from the record type's `projectId` rather than the change's `projectId`. In cross-project scenarios (rare but possible during data inconsistency), snapshots would record the wrong project context.

**Root cause:**
The `ensureSnapshot()` function in `patchOpExecutor.ts` was using the record type's `projectId` when constructing the snapshot row. If the record type's project differed from the change's project (which should itself be blocked, but wasn't always), the snapshot would be contaminated.

**Fix:**
1. Changed `ensureSnapshot()` to derive `projectId` from the Change record, not from the record type.
2. Added a cross-project validation in Phase 1 (Load): if `rt.projectId !== change.projectId`, execution aborts with a 400 error before any writes.

**Invariants enforced:**
- P1: Patch ops must target record types within the same project as the change.
- P2: Snapshots inherit project_id from the change.
- D6: Snapshot project_id from change.

**Lesson:**
Derived data (snapshots) must trace provenance to the operation that created them (the change), not to the entity they describe (the record type). This prevents a class of data-lineage bugs.

---

## Bug 2: Record types could exist without a project

**Commit:** `69327e4`

**Symptom:**
`record_types.project_id` was nullable. Record types could be created without a project association, which broke project-scoped queries and made cross-project validation in the executor unreliable.

**Root cause:**
The original schema defined `project_id` as an optional foreign key. Early record type creation paths (especially the form-based path) didn't always require a project.

**Fix:**
1. Added migration to make `project_id NOT NULL` on `record_types`.
2. Updated all record type creation paths to require `projectId`.
3. The `recordTypeService.createRecordType()` function validates that the project exists before creation.

**Invariants enforced:**
- D1: Record types must have a non-null project_id.
- P3: Record type creation requires an existing project.

**Lesson:**
Nullable foreign keys on core entities create downstream invariant violations. If an entity logically belongs to a parent, make the relationship non-null at the schema level, not just at the application level.

---

## Bug 3: Duplicate pending patch ops for the same field were allowed

**Commit:** `134d43f`

**Symptom:**
Two `set_field` patch ops targeting the same `recordType + field` combination could coexist within a single change. During execution, both would attempt to mutate the same field, leading to non-deterministic outcomes (the last op wins, silently overwriting the first).

**Root cause:**
`patchOpService.createPatchOp()` did not check for existing ops targeting the same field within the same change before creating a new one.

**Fix:**
1. Before creating a record-type patch op, the service now loads all existing patch ops for the change via `getChangePatchOpsByChange(changeId)`.
2. It builds a set of `recordType::field` keys already targeted.
3. If the new op would target an existing key, the service throws a 409 Conflict with a descriptive message.

**Invariants enforced:**
- Execution determinism (E5): Preventing duplicate ops ensures each field is mutated exactly once per change.

**Lesson:**
Uniqueness constraints that span across rows (same field, same change) cannot be enforced by database unique constraints alone when the key is embedded in JSONB. Application-level duplicate detection must be explicit.

---

## Bug 4: Executed patch ops could be deleted

**Commit:** `6ed8e70`

**Symptom:**
`DELETE /api/changes/:id/patch-ops/:opId` would succeed even if the patch op had already been executed (`executed_at IS NOT NULL`). This would silently remove audit trail entries for mutations that had already been applied to the database.

**Root cause:**
The original delete handler only checked that the change existed and the op belonged to the change. It did not check the execution status of the op.

**Fix:**
1. Added tenant ownership check: if `op.tenantId !== ctx.tenantId`, return 404 (not 403, to avoid information leakage).
2. Added execution guard: if `op.executedAt !== null`, return 409 Conflict.
3. Added change status guard: if change is Merged, return 400.
4. Changed success response to 204 No Content (was previously 200 with body).

**Invariants enforced:**
- E3: Executed patch ops cannot be deleted.
- E1: Executed changes are immutable.
- T5: Tenant check on op deletion.

**Lesson:**
Delete endpoints need the same guard density as create/execute endpoints. Every deletion of an auditable entity must check: (1) ownership, (2) execution status, (3) parent entity status.

---

## Bug 5: patchOpService tests failed after duplicate guard was added

**Commit:** `34f2c83`

**Symptom:**
After adding the duplicate field guard (Bug 3 fix), existing `patchOpService` tests started failing because the `createPatchOp` path now called `getChangePatchOpsByChange(changeId)`, which was not mocked in the test setup.

**Root cause:**
Tests mocked `getTenantStorage` but did not include `getChangePatchOpsByChange` in the mock object. When the duplicate guard code attempted to call this function, it was `undefined`, causing a runtime error.

**Fix:**
Updated all relevant test files to include `getChangePatchOpsByChange: vi.fn().mockResolvedValue([])` in the mock tenant storage object. Tests that specifically test the duplicate guard path mock it to return existing ops.

**Lesson:**
When adding a new code path that reads from storage, you must audit all test files that mock that storage layer. The mock object must be kept in sync with the interface it replaces.

---

## Bug 6: Merge transition did not execute patch ops

**Commit:** `806cd13`

**Symptom:**
Merging a change would transition the status to `Merged` but would not actually execute the patch ops. Schema mutations were never applied.

**Root cause:**
The original `updateChangeStatus("Merged")` path simply updated the status field without triggering the execution pipeline. Execution was a separate, manual step that was easy to forget.

**Fix:**
Wired `executePatchOps(ctx, changeId)` into the merge flow inside `changeService.updateChangeStatus()`. On success, status becomes `Merged`. On failure, status becomes `ValidationFailed` and a 422 is returned.

**Invariants enforced:**
- E4: All-or-nothing execution.
- E6: Snapshots captured before mutation.

**Lesson:**
Critical side effects (like execution) should be coupled to the state transition that logically requires them, not left as separate manual steps that callers might forget to invoke.

---

## Summary

| Bug | Root Cause Category | Fix Category |
|-----|--------------------|--------------|
| Snapshot project_id | Wrong data derivation | Correct provenance chain |
| Nullable project_id | Weak schema constraint | Schema migration to NOT NULL |
| Duplicate patch ops | Missing application-level uniqueness check | Pre-create duplicate scan |
| Executed op deletion | Missing guard on delete path | Multi-condition guard chain |
| Test failures after guard | Mock drift from interface | Mock synchronization |
| Merge without execution | Decoupled side effect | Coupled execution to state transition |
