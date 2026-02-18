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
