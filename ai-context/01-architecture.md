# 01 — Architecture

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                           CLIENT (React/Vite)                        │
│  Wouter routing · TanStack Query · x-tenant-id header on every req   │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ HTTP (JSON)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         EXPRESS SERVER                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  tenantResolution middleware                                    │  │
│  │  x-tenant-id (slug) → SELECT tenants WHERE slug = ? → UUID    │  │
│  │  x-user-id / x-agent-id → TenantContext                       │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ROUTES (server/routes.ts)                                     │  │
│  │  All /api/* routes receive req.tenantContext                   │  │
│  │  RBAC + Agent Guard checks inline per route                   │  │
│  └─────┬──────────┬──────────┬──────────┬────────────────────────┘  │
│        │          │          │          │                            │
│        ▼          ▼          ▼          ▼                            │
│  ┌──────────┬──────────┬──────────┬──────────┐                      │
│  │ change   │ patchOp  │ record   │ workflow │  ...other services   │
│  │ Service  │ Service  │ Type Svc │ Engine   │                      │
│  └────┬─────┴────┬─────┴────┬─────┴────┬─────┘                     │
│       │          │          │          │                             │
│       ▼          ▼          ▼          ▼                             │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  TENANT STORAGE (server/tenantStorage.ts)                      │  │
│  │  getTenantStorage(ctx) → all queries scoped by ctx.tenantId   │  │
│  └─────────────────────────┬──────────────────────────────────────┘  │
│                            │                                         │
│  ┌─────────────────────────┴──────────────────────────────────────┐  │
│  │  EXECUTOR (server/executors/patchOpExecutor.ts)                │  │
│  │  3-phase: Load → Transform → Persist                           │  │
│  │  Snapshots + schema writes + op stamping                       │  │
│  └─────────────────────────┬──────────────────────────────────────┘  │
│                            │                                         │
│  ┌─────────────────────────┴──────────────────────────────────────┐  │
│  │  EXECUTION BOUNDARY (server/execution/)                        │  │
│  │  boundaryGuard · localRunnerAdapter · remoteRunnerAdapter      │  │
│  │  capabilityProfiles · telemetryEmitter                         │  │
│  └─────────────────────────┬──────────────────────────────────────┘  │
└────────────────────────────┼─────────────────────────────────────────┘
                             │ HTTP (in production)
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      RUNNER (runner/)                                 │
│  Isolated execution process · boundaryGuard · adapters               │
│  Receives ModuleExecutionContext · enforces capability profiles       │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      POSTGRESQL                                      │
│  Drizzle ORM · single migration · all tables tenant-scoped          │
│  shared/schema.ts defines all tables + Zod insert schemas            │
└──────────────────────────────────────────────────────────────────────┘
```

## Request Lifecycle

Every API request follows this path:

```
1. Client sends request
   Headers: x-tenant-id: "acme"  x-user-id: "user-123"

2. tenantResolution middleware
   → SELECT * FROM tenants WHERE slug = 'acme'
   → Not found? 404. Missing header? 401.
   → Found: req.tenantContext = { tenantId: <UUID>, userId: "user-123", source: "header" }

3. Route handler
   → Extracts tenantContext from req
   → Calls service layer with ctx

4. Service layer
   → getTenantStorage(ctx) returns tenant-scoped DB accessor
   → All queries implicitly filtered by tenantId
   → RBAC checks via rbacService.authorize(ctx, permission)
   → Agent guard via agentGuardService.assertNotAgent(actor, action)

5. Response
   → JSON body returned to client
   → No tenant ID ever appears in response bodies (client already knows its tenant)
```

## Multi-Tenant Resolution

Tenant isolation is enforced at three layers:

### Layer 1: Middleware (identity)
The `tenantResolution` middleware converts the client-supplied slug to a server-verified UUID. No downstream code ever receives or trusts a client-supplied tenant ID.

### Layer 2: Storage (data access)
`getTenantStorage(ctx)` returns a closure where every query includes `WHERE tenant_id = ctx.tenantId`. There is no way to query across tenants through this interface.

### Layer 3: Executor (cross-entity validation)
The patch op executor validates project consistency: a patch op targeting a record type in project A cannot be executed through a change belonging to project B. This is a **cross-project** guard within a single tenant.

```
Tenant slug "acme"
       │
       ▼ middleware resolves to UUID
       │
  tenantId: "a1b2c3d4-..."
       │
       ├─► getTenantStorage(ctx)  →  SQL: WHERE tenant_id = 'a1b2c3d4-...'
       │
       └─► executor validates     →  rt.projectId === change.projectId
```

## Execution Flow (Change → Merge)

```
1. POST /api/changes                    → Creates change in Draft status
2. POST /api/changes/:id/targets        → Adds targets (must be Draft)
3. POST /api/changes/:id/patch-ops      → Adds patch ops (duplicate guard enforced)
4. POST /api/changes/:id/merge          → Triggers execution pipeline:
   │
   ├─ changeService.updateChangeStatus("Merged")
   │  ├─ executePatchOps(ctx, changeId)
   │  │  ├─ Phase 1: LOAD
   │  │  │  ├─ Resolve targets → record types
   │  │  │  ├─ Validate project consistency
   │  │  │  ├─ Load base types for protected field resolution
   │  │  │  └─ Build in-memory entry map
   │  │  │
   │  │  ├─ Phase 2: TRANSFORM (pure, no DB writes)
   │  │  │  ├─ Apply each op to in-memory schema
   │  │  │  ├─ Validate field existence / type / protection
   │  │  │  └─ On any error → return failure, zero DB writes
   │  │  │
   │  │  └─ Phase 3: PERSIST (only if Phase 2 succeeded for ALL ops)
   │  │     ├─ ensureSnapshot() per record type (idempotent)
   │  │     ├─ updateRecordTypeSchema() per record type
   │  │     └─ stampPatchOp() per op (previous_snapshot + executed_at)
   │  │
   │  ├─ On failure → status = ValidationFailed, throw 422
   │  └─ On success → status = Merged
   │
   └─ Stop workspace if running
```

Alternatively, `POST /api/changes/:id/execute` runs the execution pipeline without changing the change status.

## Snapshot Model

### Why Snapshots Exist

Snapshots are the audit backbone of the execution layer. Every time a change executes, each affected record type gets a snapshot of its schema **before mutation**. This serves three purposes:

1. **Rollback analysis.** Given a snapshot, an operator can see exactly what the schema looked like before a change was applied and reason about whether a compensating change is needed.
2. **Deterministic replay.** The snapshot chain across changes provides a point-in-time history of every record type's schema evolution. Given the initial schema and the ordered set of snapshots, the system can reconstruct any intermediate state.
3. **Conflict detection (future).** When two changes target the same record type, snapshots enable detection of concurrent mutations — the second change's snapshot will differ from the first change's post-execution schema.

### When Snapshots Are Created

Snapshots are created during **Phase 3 (Persist)** of the execution engine, specifically by `ensureSnapshot()`:

```
Phase 2 succeeds for ALL ops
  │
  ▼ Phase 3 begins
  │
  ├─ For each modified record type:
  │   ├─ ensureSnapshot(tenantId, projectId, recordTypeKey, changeId, originalSchema)
  │   │   ├─ SELECT FROM record_type_snapshots WHERE changeId AND recordTypeKey AND tenantId
  │   │   ├─ If exists → skip (idempotent)
  │   │   └─ If not → INSERT snapshot with original schema
  │   │
  │   └─ updateRecordTypeSchema(rt.id, mutatedSchema)
  │
  └─ For each op: stamp previous_snapshot + executed_at
```

Snapshots are **never** created during Phase 1 (Load) or Phase 2 (Transform). They are only written after all in-memory transforms succeed, ensuring the snapshot is always paired with a successful mutation.

### Snapshot Scope

Every snapshot is scoped by four dimensions:

| Dimension | Column | Source |
|-----------|--------|--------|
| Tenant | `tenant_id` | Inherited from the tenant context (closure in `getTenantStorage`) |
| Project | `project_id` | Inherited from `change.projectId`, **not** from the record type |
| Change | `change_id` | The change that triggered this execution |
| Record Type | `record_type_key` | The key of the record type being snapshotted |

The unique constraint `(change_id, record_type_key)` guarantees at most one snapshot per record type per change. This makes `ensureSnapshot()` idempotent — repeated execution of the same change will not create duplicate snapshots.

### How Snapshots Differ from ServiceNow Update Sets

| Concern | ServiceNow Update Set | EC3L Snapshot |
|---------|----------------------|---------------|
| Granularity | Entire record XML blob (all fields, all metadata) | Schema-only JSON (field definitions at point-in-time) |
| When captured | On "insert to update set" (manual or automatic) | Automatically during execution, before mutation |
| Scope | Per-instance, per-update-set | Per-tenant, per-project, per-change, per-record-type |
| Idempotency | Not guaranteed — duplicates possible | Guaranteed by unique constraint |
| Mutability | Can be modified before promotion | Immutable once written |
| Provenance | Tied to the update set | Tied to the change (inherits change's project_id) |

### Performance Characteristics

Snapshots use **copy-on-write semantics**, not deep cloning:

- The `originalSchema` captured at Phase 1 (Load) is the raw JSONB value read from the database.
- During Phase 2 (Transform), each op creates a **new object** for the mutated schema — the original reference is never modified.
- At Phase 3 (Persist), the original reference is written as the snapshot. No serialization/deserialization overhead beyond the initial read.
- Snapshot size is proportional to the number of fields on the record type, not to the number of ops in the change. A record type with 50 fields produces the same size snapshot whether 1 or 20 ops target it.

## Separation of Concerns

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Control Plane** | Metadata CRUD, state machine, tenant resolution, RBAC | `server/routes.ts`, `server/services/`, `server/middleware/` |
| **Execution Layer** | 3-phase patch op engine, snapshots, schema mutation | `server/executors/patchOpExecutor.ts` |
| **Runner Adapter** | Boundary enforcement, capability checks, telemetry | `server/execution/`, `runner/` |
| **Storage** | Tenant-scoped data access, query construction | `server/tenantStorage.ts`, `server/storage.ts` |
| **Schema** | Table definitions, Zod validators, TypeScript types | `shared/schema.ts` |
| **Client** | UI rendering, API calls with tenant header | `client/` |

## Key Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| ORM | Drizzle | Type-safe SQL, minimal abstraction, clean migration story |
| Validation | Zod (via Drizzle) | Schema-first validation with TypeScript inference |
| API | Express | Simple, well-understood, no framework magic |
| Database | PostgreSQL | JSONB for schemas, strong constraint support, reliable |
| Testing | Vitest | Fast, ESM-native, clean mocking with `vi.mock` |
| Client | React + Vite | Standard SPA with HMR; not the focus of this platform |
