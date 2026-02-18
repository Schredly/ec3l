# 02 — Invariants

Every statement below is a hard constraint. Violations are bugs.

---

## Data Invariants

**D1. Record types must have a non-null project_id.**
Every `record_types` row has `project_id NOT NULL`. A record type without a project is invalid.

**D2. Record type keys are unique per tenant + project.**
The unique constraint `(tenant_id, project_id, key)` prevents two record types from sharing a key within the same project scope.

**D3. Record type names are unique per tenant.**
The unique constraint `(tenant_id, name)` prevents name collisions across a tenant's full record type catalog.

**D4. Change records must have a non-null project_id.**
Every `change_records` row has `project_id` as a foreign key to `projects`. A change without a project is orphaned.

**D5. Snapshots are unique per change + record type key.**
The unique constraint `(change_id, record_type_key)` on `record_type_snapshots` ensures one snapshot per record type per change. Snapshot creation is idempotent.

**D6. Snapshots persist the change's project_id, not the record type's.**
The `project_id` on a snapshot is derived from the parent change, not from the record type being snapshotted. This prevents cross-project contamination in the audit trail.

**D7. Patch op `previous_snapshot` and `executed_at` are set atomically.**
When a patch op is executed, both `previous_snapshot` (the schema before mutation) and `executed_at` (timestamp) are written in the same update. Neither can exist without the other.

**D8. Schema field types are constrained to a known set.**
Valid field types: `string`, `number`, `boolean`, `reference`, `choice`, `text`, `date`, `datetime`. Any other value is rejected at creation time.

**D9. Change targets have typed selectors.**
Each target type (`form`, `workflow`, `rule`, `record_type`, `script`, `file`) requires a selector matching its type. A `record_type` target needs a `recordTypeKey`; a `file` target needs a `filePath`.

---

## Execution Invariants

**E1. Executed changes are immutable.**
Once a change reaches `Merged` status, it cannot be modified. No targets can be added. No patch ops can be added or deleted. Status cannot be changed.
> **Enforced** in `patchOpExecutor.executeChange` (rejects `change.status === "Merged"` before loading ops), `changeService.ts`, and `patchOpService.ts`.

**E2. A change cannot be executed twice.**
The merge flow is idempotent in effect — snapshot creation checks for existing snapshots — but re-execution of an already-merged change is blocked at the service layer.
> **Enforced** in `patchOpExecutor.executeChange` (rejects if any op has `executedAt !== null` before Phase 1 begins) and `changeService.ts`.

**E3. Executed patch ops cannot be deleted.**
If `executed_at IS NOT NULL` on a patch op, deletion returns 409 Conflict. This preserves the audit trail.

**E4. Execution is all-or-nothing.**
The 3-phase executor applies all ops in memory (Phase 2: Transform) before writing anything to the database (Phase 3: Persist). If any single op fails validation, zero database writes occur.

**E5. Execution is deterministic.**
Given the same base schemas and the same ordered set of patch ops, the executor produces the same result. There is no randomness, no timestamp-dependent logic, and no external state in the transform phase.

**E6. Snapshots are captured before mutation.**
The executor calls `ensureSnapshot()` before calling `updateRecordTypeSchema()`. The snapshot contains the pre-execution schema, enabling rollback analysis.

**E7. Base-type protected fields cannot be weakened.**
If record type `incident` has `baseType: "task"`, and `task` declares field `title` as `required: true`, then no patch op on `incident` can set `title.required = false`, remove `title`, or rename `title`.

---

## Project Invariants

**P1. Patch ops must target record types within the same project as the change.**
At execution time, the executor loads the target record type and compares `rt.projectId` against `change.projectId`. A mismatch throws a 400 error and aborts execution.

**P2. Snapshots inherit project_id from the change.**
This is the data-side enforcement of P1. Even if the record type were somehow in a different project, the snapshot would still record the change's project context.

**P3. Record type creation requires an existing project.**
`recordTypeService.createRecordType` validates that the specified project exists before creating the record type.

**P4. Changes list by project.**
`GET /api/projects/:id/changes` returns only changes belonging to that project, further scoped by tenant.

**P5. Change targets inherit project_id from their parent change.**
`changeTargetService.createChangeTarget` derives `projectId` from `change.projectId`, never from the request body. This prevents targets from drifting to a different project than their change.

**P6. Base types must belong to the same project as the derived record type.**
If `incident` declares `baseType: "task"`, then `task.projectId` must equal `incident.projectId`. Cross-project inheritance creates unresolvable dependency chains.
> **Enforced** in `recordTypeService.createRecordType` and `recordTypeService.updateRecordType`. Both check `base.projectId === data.projectId` and `base.tenantId === ctx.tenantId` before allowing a baseType reference.

**P7. Patch op creation should validate record type project consistency early.**
When a record-type patch op is created, `patchOpService` should verify that the target record type belongs to the same project as the change, not defer this check to execution time.
> **Enforced** in `patchOpService.createPatchOp`. Fail-fast guard checks `target.projectId === change.projectId` and `target.tenantId === ctx.tenantId` before creating the op. The executor retains its Phase 1 check as defense-in-depth.

---

## Project Scoping Enforcement Gaps

The following invariants are documented but not yet enforced. They represent hardening work.

| Gap | Current Behavior | Required Behavior | Enforcement Point |
|-----|-----------------|-------------------|-------------------|
| ~~P6~~ | ~~Base type resolved tenant-wide~~ | ~~Must match project~~ | **RESOLVED** — `recordTypeService.ts` |
| ~~P7~~ | ~~Cross-project check deferred to execution~~ | ~~Fail-fast at op creation~~ | **RESOLVED** — `patchOpService.ts` |
| `record_types.key` nullable at DB | Service enforces non-empty, DB allows NULL | Add `NOT NULL` constraint | `shared/schema.ts` |
| Op creation on Merged changes | No status guard on `createPatchOp` | Block if change is Merged/Ready | `patchOpService.ts` |

These gaps do not currently cause data corruption because the executor catches them, but they allow invalid state to persist in the database until execution time.

---

## Tenant Invariants

**T1. Tenant identity is resolved server-side from a slug.**
The `x-tenant-id` header carries a tenant slug (e.g., `"acme"`). The middleware resolves it to a UUID via database lookup. No client-supplied UUID is ever trusted.

**T2. All data access is tenant-scoped.**
`getTenantStorage(ctx)` returns a data accessor where every query includes `WHERE tenant_id = ctx.tenantId`. There is no method to query across tenants.

**T3. Missing tenant header returns 401.**
If `x-tenant-id` is absent, the request is rejected before reaching any route handler.

**T4. Unknown tenant slug returns 404.**
If `x-tenant-id` is present but no matching tenant exists, the request is rejected with 404.

**T5. Patch op deletion validates tenant ownership.**
When deleting a patch op, if `op.tenantId !== ctx.tenantId`, the response is 404 (not 403 — no information leakage about other tenants' data).

**T6. No sessions. No cookies. No client-supplied tenant IDs in request bodies.**
The platform is stateless. Tenant context comes exclusively from the `x-tenant-id` header, resolved by middleware. No route handler reads tenant identity from the request body.

---

## RBAC Invariants

**R1. Agents cannot perform approval or privileged actions.**
`assertNotAgent(actor, action)` throws 403 for actors with `actorType: "agent"`. This applies to: change approval (Ready/Merged), override activation, workflow execution, workflow approval, trigger firing, and proposal review.

**R2. RBAC checks are per-tenant.**
Role assignments and permission checks are scoped to the tenant context. A user's role in tenant A has no effect in tenant B.

**R3. System actors bypass RBAC.**
Actors with `actorType: "system"` are not subject to permission checks. This is used for internal operations (e.g., seed, install, scheduler).

---

## Summary Table

| ID | Invariant | Enforcement Point |
|----|-----------|-------------------|
| D1 | Record type requires project_id | DB NOT NULL constraint |
| D2 | Key unique per tenant+project | DB unique constraint |
| D3 | Name unique per tenant | DB unique constraint |
| D4 | Change requires project_id | DB foreign key |
| D5 | One snapshot per change+key | DB unique constraint |
| D6 | Snapshot project_id from change | patchOpExecutor.ts |
| D7 | Snapshot + executed_at atomic | patchOpExecutor.ts |
| D8 | Field types constrained | patchOpService.ts |
| D9 | Typed target selectors | changeTargetService.ts |
| E1 | Executed changes immutable | patchOpExecutor.ts, changeService.ts, patchOpService.ts |
| E2 | No double execution | patchOpExecutor.ts, changeService.ts |
| E3 | No deleting executed ops | patchOpService.ts |
| E4 | All-or-nothing execution | patchOpExecutor.ts |
| E5 | Deterministic transforms | patchOpExecutor.ts |
| E6 | Snapshot before mutation | patchOpExecutor.ts |
| E7 | Base-type field protection | patchOpExecutor.ts |
| P1 | Cross-project op rejection | patchOpExecutor.ts |
| P2 | Snapshot inherits change project | patchOpExecutor.ts |
| P3 | RT creation validates project | recordTypeService.ts |
| P4 | Changes scoped to project | tenantStorage.ts |
| P5 | Target project_id from change | changeTargetService.ts |
| P6 | Base type same project as derived | recordTypeService.ts |
| P7 | Op creation validates project early | patchOpService.ts |
| T1 | Slug-to-UUID resolution | middleware/tenant.ts |
| T2 | Tenant-scoped queries | tenantStorage.ts |
| T3 | Missing header → 401 | middleware/tenant.ts |
| T4 | Unknown slug → 404 | middleware/tenant.ts |
| T5 | Tenant check on op deletion | patchOpService.ts |
| T6 | No sessions/cookies/body IDs | Architecture (structural) |
| R1 | Agent guard on approvals | agentGuardService.ts |
| R2 | Per-tenant RBAC | rbacService.ts |
| R3 | System actor bypass | rbacService.ts |
