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

**Response 204:** No content (success).

**Error responses:**

| Condition | Status | Body |
|-----------|--------|------|
| Change not found | 404 | `{ "error": "Change not found" }` |
| Change is Merged | 400 | `{ "error": "Cannot delete patch ops from a merged change" }` |
| Op not found or wrong tenant | 404 | `{ "error": "Patch op not found" }` |
| Op belongs to different change | 400 | `{ "error": "Patch op does not belong to this change" }` |
| Op already executed | 409 | `{ "error": "Cannot delete an executed patch op" }` |

---

## Execution

### POST /api/changes/:id/execute

Executes all patch ops for the change without changing the change status. Useful for testing execution independently of the merge flow.

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

**Response 404:**
```json
{ "error": "Change not found" }
```

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
Cause: Patch op validation failed during the transform phase.
