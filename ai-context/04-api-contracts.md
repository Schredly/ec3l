# 04 — API Contracts

All requests to `/api/*` (except `GET /api/tenants`) require:

```
Headers:
  x-tenant-id: <tenant-slug>     (required)
  x-user-id: <user-id>           (optional)
  x-agent-id: <agent-id>         (optional, mutually exclusive with x-user-id)
  Content-Type: application/json  (for POST/PUT/PATCH)
```

---

## Tenants

### GET /api/tenants

List all tenants. No tenant header required.

**Response 200:**
```json
[
  {
    "id": "a1b2c3d4-...",
    "name": "Acme Corp",
    "slug": "acme",
    "plan": "enterprise",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

## Projects

### POST /api/projects

**Request:**
```json
{
  "name": "Platform Core",
  "description": "Core platform configuration",
  "githubRepo": "acme/platform-core",
  "defaultBranch": "main"
}
```

**Response 201:**
```json
{
  "id": "p1-...",
  "name": "Platform Core",
  "tenantId": "a1b2c3d4-...",
  "description": "Core platform configuration",
  "githubRepo": "acme/platform-core",
  "defaultBranch": "main",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### GET /api/projects

**Response 200:** Array of project objects scoped to tenant.

### GET /api/projects/:id

**Response 200:** Single project object.

---

## Changes

### POST /api/changes

**Request:**
```json
{
  "title": "Add priority field to incidents",
  "description": "Extends incident record type with a priority choice field",
  "projectId": "p1-...",
  "baseSha": "abc123",
  "branchName": "feat/incident-priority"
}
```

**Response 201:**
```json
{
  "id": "c1-...",
  "title": "Add priority field to incidents",
  "description": "Extends incident record type with a priority choice field",
  "projectId": "p1-...",
  "status": "Draft",
  "baseSha": "abc123",
  "branchName": "feat/incident-priority",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### GET /api/changes

**Response 200:** Array of change objects scoped to tenant.

### GET /api/changes/:id

**Response 200:** Single change object.

**Response 404:**
```json
{ "error": "Change not found" }
```

---

## Change Targets

### POST /api/changes/:id/targets

**Request (record_type target):**
```json
{
  "type": "record_type",
  "selector": { "recordTypeKey": "incident" }
}
```

**Request (file target):**
```json
{
  "type": "file",
  "selector": { "filePath": "src/components/IncidentForm.tsx" }
}
```

**Response 201:**
```json
{
  "id": "t1-...",
  "tenantId": "a1b2c3d4-...",
  "projectId": "p1-...",
  "changeId": "c1-...",
  "type": "record_type",
  "selector": { "recordTypeKey": "incident" },
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Validation errors:**

| Condition | Status | Body |
|-----------|--------|------|
| Change not in Draft | 400 | `{ "error": "Change must be in Draft status to add targets" }` |
| Invalid target type | 400 | `{ "error": "Invalid target type" }` |
| Missing selector fields | 400 | `{ "error": "..." }` |

### GET /api/changes/:id/targets

**Response 200:** Array of target objects for the change.

---

## Patch Ops

### POST /api/changes/:id/patch-ops

**Request (set_field):**
```json
{
  "targetId": "t1-...",
  "opType": "set_field",
  "payload": {
    "recordType": "incident",
    "field": "priority",
    "definition": {
      "type": "choice",
      "required": true
    }
  }
}
```

**Request (add_field):**
```json
{
  "targetId": "t1-...",
  "opType": "add_field",
  "payload": {
    "recordType": "incident",
    "field": "severity",
    "definition": {
      "type": "string",
      "required": false
    }
  }
}
```

**Request (remove_field):**
```json
{
  "targetId": "t1-...",
  "opType": "remove_field",
  "payload": {
    "recordType": "incident",
    "field": "legacy_status"
  }
}
```

**Request (rename_field):**
```json
{
  "targetId": "t1-...",
  "opType": "rename_field",
  "payload": {
    "recordType": "incident",
    "oldName": "desc",
    "newName": "description"
  }
}
```

**Request (edit_file):**
```json
{
  "targetId": "t2-...",
  "opType": "edit_file",
  "payload": {
    "filePath": "src/components/IncidentForm.tsx",
    "diff": "..."
  }
}
```

**Response 201:**
```json
{
  "id": "op1-...",
  "tenantId": "a1b2c3d4-...",
  "changeId": "c1-...",
  "targetId": "t1-...",
  "opType": "set_field",
  "payload": { "..." },
  "previousSnapshot": null,
  "executedAt": null,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Validation errors:**

| Condition | Status | Body |
|-----------|--------|------|
| Duplicate field op in change | 409 | `{ "error": "A pending patch op for field \"priority\" on record type \"incident\" already exists in this change" }` |
| Invalid field type in definition | 400 | `{ "error": "Invalid field type \"foo\". Allowed types: string, number, boolean, reference, choice, text, date, datetime" }` |
| Op type doesn't match target type | 400 | `{ "error": "..." }` |
| Missing required payload fields | 400 | `{ "error": "..." }` |

### GET /api/changes/:id/patch-ops

**Response 200:** Array of patch op objects for the change.

### DELETE /api/changes/:id/patch-ops/:opId

Deletes a **pending** patch op from a change. Executed ops and ops on merged changes cannot be deleted.

**Response 204:** No content (success).

**Error responses (evaluated in order):**

| # | Condition | Status | Body | Rationale |
|---|-----------|--------|------|-----------|
| 1 | Change not found | 404 | `{ "error": "Change not found" }` | Tenant-scoped lookup failed. |
| 2 | Change is Merged | 400 | `{ "error": "Cannot delete patch ops from a merged change" }` | Immutability invariant (E1). |
| 3 | Op not found or wrong tenant | 404 | `{ "error": "Patch op not found" }` | Returns 404 (not 403) to prevent tenant information leakage (T5). |
| 4 | Op belongs to different change | 400 | `{ "error": "Patch op does not belong to this change" }` | Ownership mismatch. |
| 5 | Op already executed | 409 | `{ "error": "Cannot delete an executed patch op" }` | Audit trail preservation (E3). |

**DELETE rules summary:**

| Op state | Change state | DELETE allowed? |
|----------|-------------|----------------|
| Pending | Draft | Yes |
| Pending | Implementing / WorkspaceRunning / ValidationFailed | Yes |
| Pending | Ready | Yes (no status guard beyond Merged) |
| Pending | Merged | No (400) |
| Executed | Any | No (409) |

---

## Execution

### POST /api/changes/:id/execute

Executes all patch ops for the change **without changing the change status**. This is a testing/validation hook, not a production transition. See `POST /merge` for the authoritative lifecycle endpoint.

**Request:** Empty body.

**Response 200 (success):**
```json
{
  "success": true,
  "appliedCount": 3
}
```

**Response 422 (execution failure):**
```json
{
  "error": "Execution failed: Field \"title\" is protected by base type \"task\" and cannot be removed"
}
```

The 422 response means the Transform phase (Phase 2) rejected one or more ops. **Zero database writes occurred.** All ops remain in `Pending` state.

**Response 404:**
```json
{ "error": "Change not found" }
```

**Idempotency behavior:**

| Scenario | Behavior |
|----------|----------|
| First call, all ops pending | Executes all ops. Stamps `executed_at` + `previous_snapshot`. Creates snapshots. Returns `appliedCount`. |
| Second call, ops already executed | Re-applies transforms against current schema. Re-stamps ops. Snapshot creation is idempotent (skipped if exists). Schema writes produce same result. **Known gap:** ops are re-stamped with a new `executed_at` timestamp. |
| Call after `/merge` succeeded | Same behavior as second call. **Known gap:** no status guard blocks execution of a Merged change via `/execute`. |

> **Hardening TODO:** The executor should skip ops where `executed_at IS NOT NULL`, and the `/execute` endpoint should reject changes in `Merged` status.

### POST /api/changes/:id/merge

Executes all patch ops, then transitions the change to Merged.

**Request:**
```json
{
  "branchName": "feat/incident-priority"
}
```

**Response 200 (success):**
```json
{
  "id": "c1-...",
  "status": "Merged",
  "branchName": "feat/incident-priority"
}
```

**Response 422 (execution failure):**
```json
{
  "error": "Execution failed: ..."
}
```

Change status is set to `ValidationFailed` on execution failure.

**RBAC:** Requires `change.approve` permission.
**Agent Guard:** Agents cannot merge changes.

---

## Record Types

### POST /api/record-types

**Request:**
```json
{
  "key": "incident",
  "name": "Incident",
  "projectId": "p1-...",
  "description": "IT incident tracking record",
  "baseType": "task",
  "schema": {
    "fields": [
      { "name": "title", "type": "string", "required": true },
      { "name": "status", "type": "choice" }
    ]
  }
}
```

**Response 201:**
```json
{
  "id": "rt1-...",
  "tenantId": "a1b2c3d4-...",
  "projectId": "p1-...",
  "key": "incident",
  "name": "Incident",
  "description": "IT incident tracking record",
  "baseType": "task",
  "schema": { "fields": [...] },
  "version": 1,
  "status": "draft",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Validation errors:**

| Condition | Status | Body |
|-----------|--------|------|
| Key already exists | 409 | `{ "error": "Record type with key \"incident\" already exists" }` |
| Project not found | 404 | `{ "error": "Project not found" }` |
| Invalid field type | 400 | `{ "error": "Invalid field type ..." }` |
| Base type not found | 404 | `{ "error": "Base type \"...\" not found" }` |

### GET /api/record-types

**Response 200:** Array of record types for the tenant.

### GET /api/record-types/by-key/:key

**Response 200:** Single record type matching the key.

### POST /api/record-types/:id/activate

**Response 200:** Record type with `status: "active"`.

### POST /api/record-types/:id/retire

**Response 200:** Record type with `status: "retired"`.

---

## Workflow Definitions

### POST /api/workflow-definitions

**Request:**
```json
{
  "name": "Incident Approval",
  "projectId": "p1-...",
  "triggerType": "record_event",
  "triggerConfig": {
    "recordType": "incident",
    "event": "created"
  }
}
```

**Response 201:** Workflow definition object.

### POST /api/workflow-definitions/:id/steps

**Request:**
```json
{
  "stepType": "approval",
  "config": {
    "approverRole": "manager",
    "message": "Please review this incident"
  },
  "orderIndex": 1
}
```

Step types: `assignment`, `approval`, `notification`, `decision`, `record_mutation`, `record_lock`.

### POST /api/workflow-definitions/:id/execute

Manually execute a workflow. Creates an execution in `running` state.

**RBAC:** Requires `workflow.execute` permission.
**Agent Guard:** Agents cannot execute workflows.

---

## RBAC

### POST /api/rbac/seed-defaults

Seeds default roles and permissions for the tenant. Idempotent.

**Response 200:**
```json
{ "message": "Default RBAC configuration seeded" }
```

---

## Common Error Patterns

### 401 — Missing Tenant Context
```json
{ "error": "Missing tenant context" }
```
Cause: `x-tenant-id` header not provided.

### 404 — Tenant Not Found
```json
{ "error": "Tenant 'nonexistent' not found" }
```
Cause: `x-tenant-id` header contains a slug that doesn't match any tenant.

### 403 — RBAC Denied
```json
{ "error": "Access denied: required permission 'change.approve'" }
```
Cause: User does not have the required role/permission.

### 403 — Agent Guard
```json
{ "error": "Agents are not permitted to approve changes" }
```
Cause: Request made with `x-agent-id` header for a human-only action.

### 409 — Conflict
```json
{ "error": "A pending patch op for field \"priority\" on record type \"incident\" already exists in this change" }
```
Cause: Duplicate field targeting within a single change.

### 422 — Execution Failure
```json
{ "error": "Execution failed: ..." }
```
Cause: Patch op validation failed during the transform phase. Zero database writes occurred.

---

## Error Code Semantics Reference

The platform uses HTTP status codes with specific, consistent meaning:

| Code | Meaning in EC3L | When to use |
|------|-----------------|-------------|
| **400** | Structural request error or business rule violation | Missing fields, invalid types, ownership mismatch, change is Merged |
| **401** | Missing identity | No `x-tenant-id` header |
| **403** | Authorization denied | RBAC check failed, agent guard triggered |
| **404** | Entity not found (or hidden) | Unknown tenant slug, missing change/op/target. Also used instead of 403 when masking cross-tenant access attempts (T5). |
| **409** | State conflict | Duplicate patch op for same field, delete of executed op, record type key already exists |
| **422** | Execution failure | Transform phase rejected an op. All-or-nothing — zero writes occurred. The change status may transition to `ValidationFailed`. |

### 409 vs 422 — Key Distinction

- **409 (Conflict):** The request is structurally valid but conflicts with existing state. The caller should resolve the conflict (delete the duplicate, use a different key) and retry.
- **422 (Unprocessable):** The execution engine evaluated the ops and found a semantic violation (protected field, field not found, type mismatch). The caller should fix the op's payload or rethink the change.

### Idempotency Expectations

| Endpoint | Idempotent? | Notes |
|----------|-------------|-------|
| `GET *` | Yes | Read-only. |
| `POST /changes` | No | Creates a new change each call. |
| `POST /changes/:id/targets` | No | Creates a new target each call. |
| `POST /changes/:id/patch-ops` | No | Creates a new op each call. Duplicate guard prevents same-field conflicts (409). |
| `DELETE /changes/:id/patch-ops/:opId` | Yes | First call returns 204. Subsequent calls return 404 (op already deleted). |
| `POST /changes/:id/execute` | Partially | Snapshots are idempotent. Schema writes are convergent. Op timestamps are re-stamped (known gap). |
| `POST /changes/:id/merge` | No | First call merges. Second call attempts re-execution on an already-Merged change (known gap). |
