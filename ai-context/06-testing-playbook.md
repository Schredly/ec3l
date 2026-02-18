# 06 — Testing Playbook

All commands assume the server is running locally on port 5000. Adjust `BASE` as needed.

```bash
BASE=http://localhost:5000/api
TENANT=default
```

All requests include:
```bash
-H "x-tenant-id: $TENANT" -H "Content-Type: application/json"
```

---

## 1. Setup: Create Tenant and Project

### Verify tenant exists

```bash
curl -s $BASE/tenants | jq '.[] | select(.slug == "default")'
```

Expected: A tenant object with `slug: "default"`.

### Create a project

```bash
curl -s -X POST $BASE/projects \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "description": "Integration test project"
  }' | jq .
```

Save the returned `id` as `PROJECT_ID`.

```bash
PROJECT_ID=<returned-id>
```

---

## 2. Record Type CRUD

### Create a base record type

```bash
curl -s -X POST $BASE/record-types \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"task\",
    \"name\": \"Task\",
    \"projectId\": \"$PROJECT_ID\",
    \"schema\": {
      \"fields\": [
        { \"name\": \"title\", \"type\": \"string\", \"required\": true },
        { \"name\": \"status\", \"type\": \"choice\" }
      ]
    }
  }" | jq .
```

### Create a derived record type

```bash
curl -s -X POST $BASE/record-types \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"incident\",
    \"name\": \"Incident\",
    \"projectId\": \"$PROJECT_ID\",
    \"baseType\": \"task\",
    \"schema\": {
      \"fields\": [
        { \"name\": \"severity\", \"type\": \"string\" }
      ]
    }
  }" | jq .
```

### List record types

```bash
curl -s $BASE/record-types \
  -H "x-tenant-id: $TENANT" | jq .
```

### Get by key

```bash
curl -s $BASE/record-types/by-key/incident \
  -H "x-tenant-id: $TENANT" | jq .
```

---

## 3. Full Change Lifecycle (Draft → Merge)

### Step 1: Create a change

```bash
curl -s -X POST $BASE/changes \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Add priority to incidents\",
    \"description\": \"Adds a priority field to the incident record type\",
    \"projectId\": \"$PROJECT_ID\"
  }" | jq .
```

Save as `CHANGE_ID`.

```bash
CHANGE_ID=<returned-id>
```

### Step 2: Add a target

```bash
curl -s -X POST $BASE/changes/$CHANGE_ID/targets \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "record_type",
    "selector": { "recordTypeKey": "incident" }
  }' | jq .
```

Save as `TARGET_ID`.

```bash
TARGET_ID=<returned-id>
```

### Step 3: Add a patch op

```bash
curl -s -X POST $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"targetId\": \"$TARGET_ID\",
    \"opType\": \"add_field\",
    \"payload\": {
      \"recordType\": \"incident\",
      \"field\": \"priority\",
      \"definition\": {
        \"type\": \"choice\",
        \"required\": true
      }
    }
  }" | jq .
```

Save as `OP_ID`.

```bash
OP_ID=<returned-id>
```

### Step 4: List patch ops

```bash
curl -s $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" | jq .
```

Verify: One op with `executedAt: null`.

### Step 5: Execute (standalone, no status change)

```bash
curl -s -X POST $BASE/changes/$CHANGE_ID/execute \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" | jq .
```

Expected: `{ "success": true, "appliedCount": 1 }`

### Step 6: Verify record type was mutated

```bash
curl -s $BASE/record-types/by-key/incident \
  -H "x-tenant-id: $TENANT" | jq '.schema.fields'
```

Expected: `priority` field now present alongside `severity`.

### Step 7: Verify patch op was stamped

```bash
curl -s $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" | jq '.[0] | { executedAt, previousSnapshot }'
```

Expected: `executedAt` is a timestamp. `previousSnapshot` contains the schema before mutation.

---

## 4. Patch Op CRUD Lifecycle

### Create

```bash
# Create a new change + target first (reuse setup from section 3)

curl -s -X POST $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"targetId\": \"$TARGET_ID\",
    \"opType\": \"set_field\",
    \"payload\": {
      \"recordType\": \"incident\",
      \"field\": \"category\",
      \"definition\": { \"type\": \"string\" }
    }
  }" | jq .
```

### List

```bash
curl -s $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" | jq .
```

### Delete (before execution)

```bash
curl -s -X DELETE $BASE/changes/$CHANGE_ID/patch-ops/$OP_ID \
  -H "x-tenant-id: $TENANT" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 204 (no body).

### Delete (after execution — should fail)

```bash
# First execute, then try to delete
curl -s -X DELETE $BASE/changes/$CHANGE_ID/patch-ops/$EXECUTED_OP_ID \
  -H "x-tenant-id: $TENANT" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 409. Body: `{ "error": "Cannot delete an executed patch op" }`

---

## 5. Failure Case Tests

### 5a. Duplicate field op (409)

```bash
# First op
curl -s -X POST $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"targetId\": \"$TARGET_ID\",
    \"opType\": \"set_field\",
    \"payload\": {
      \"recordType\": \"incident\",
      \"field\": \"urgency\",
      \"definition\": { \"type\": \"string\" }
    }
  }" | jq .

# Duplicate (same field)
curl -s -X POST $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"targetId\": \"$TARGET_ID\",
    \"opType\": \"set_field\",
    \"payload\": {
      \"recordType\": \"incident\",
      \"field\": \"urgency\",
      \"definition\": { \"type\": \"number\" }
    }
  }" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 409.

### 5b. Invalid field type (400)

```bash
curl -s -X POST $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"targetId\": \"$TARGET_ID\",
    \"opType\": \"set_field\",
    \"payload\": {
      \"recordType\": \"incident\",
      \"field\": \"bad_field\",
      \"definition\": { \"type\": \"invalid_type\" }
    }
  }" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 400. Message about allowed types.

### 5c. Missing tenant header (401)

```bash
curl -s $BASE/changes -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 401. `{ "error": "Missing tenant context" }`

### 5d. Unknown tenant (404)

```bash
curl -s $BASE/changes \
  -H "x-tenant-id: nonexistent" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 404. `{ "error": "Tenant 'nonexistent' not found" }`

### 5e. Delete op from merged change (400)

```bash
# After merging a change, attempt to delete one of its ops
curl -s -X DELETE $BASE/changes/$MERGED_CHANGE_ID/patch-ops/$OP_ID \
  -H "x-tenant-id: $TENANT" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 400. `{ "error": "Cannot delete patch ops from a merged change" }`

### 5f. Base type field protection on execution (422)

```bash
# incident inherits from task; task has "title" as required
# Try to remove "title" from incident

curl -s -X POST $BASE/changes/$CHANGE_ID/patch-ops \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{
    \"targetId\": \"$TARGET_ID\",
    \"opType\": \"remove_field\",
    \"payload\": {
      \"recordType\": \"incident\",
      \"field\": \"title\"
    }
  }" | jq .

curl -s -X POST $BASE/changes/$CHANGE_ID/execute \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" -w "\nHTTP Status: %{http_code}\n"
```

Expected: HTTP 422. Error about protected field.

---

## 6. Idempotency Test

### Snapshot idempotency

Execute the same change twice (via the standalone `/execute` endpoint):

```bash
# First execution
curl -s -X POST $BASE/changes/$CHANGE_ID/execute \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" | jq .

# Second execution (same change, same ops)
curl -s -X POST $BASE/changes/$CHANGE_ID/execute \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" | jq .
```

Both should return `{ "success": true }`. The snapshot is created only once (idempotent `ensureSnapshot()` checks for existing snapshot before inserting). The schema writes are applied again but produce the same result.

### Verify single snapshot

```bash
# Check that only one snapshot exists for the change + record type
# (This requires direct DB access or an API that exposes snapshots)
```

---

## 7. Multi-Op Execution Test

Test that multiple ops in a single change are applied atomically.

```bash
# Create change, target, and three ops:
# 1. add_field: "priority" (choice)
# 2. set_field: "severity" (change type to number)
# 3. rename_field: "status" → "current_status"

# Execute all at once
curl -s -X POST $BASE/changes/$CHANGE_ID/execute \
  -H "x-tenant-id: $TENANT" \
  -H "Content-Type: application/json" | jq .
```

Expected: `{ "success": true, "appliedCount": 3 }`

Verify all three mutations applied:
```bash
curl -s $BASE/record-types/by-key/incident \
  -H "x-tenant-id: $TENANT" | jq '.schema.fields | map(.name)'
```

Expected: `["title", "current_status", "severity", "priority"]` (order may vary).

---

## 8. Unit Tests

Run the full test suite:

```bash
npx vitest run
```

Run specific test files:

```bash
npx vitest run server/services/__tests__/patchOpService.test.ts
npx vitest run server/executors/__tests__/patchOpExecutor.test.ts
npx vitest run server/services/__tests__/changeService.test.ts
npx vitest run server/services/__tests__/recordTypeService.test.ts
```

All tests run without a database (fully mocked via `vi.mock`).
