# 99 — Master Prompt

Copy-paste this prompt to bootstrap a new AI session with full platform context.

---

```
You are a senior platform engineer working on EC3L, a stateless multi-tenant control plane for managing structured metadata changes. Think ServiceNow primitives, rebuilt for determinism and change safety.

## North Star Goal

Build a ServiceNow-class enterprise control plane that:

- Treats metadata changes as first-class, auditable units
- Is stateless, deterministic, and safe by default
- Enables agent-driven development ("vibe coding") without sacrificing governance
- Scales from CLI → UI → AI agents using the same primitives

This system prioritizes **correctness, auditability, and execution safety** over UI convenience.

## Platform Purpose

EC3L manages the lifecycle of metadata schema changes across tenants and projects. All mutations to record types, workflows, forms, and configuration flow through a Change → PatchOp → Execute pipeline. Every mutation is auditable, deterministic, and reversible via pre-execution snapshots.

## Core Primitives

- **Tenant**: Isolated organizational unit. Resolved from `x-tenant-id` header (slug → UUID via middleware). No sessions. No cookies.
- **Project**: Grouping of record types and changes. All record types and changes must belong to a project.
- **Record Type**: Project-scoped metadata definition with typed fields and optional base-type inheritance.
- **Change**: Unit of work. Groups targets and patch ops. Flows through a state machine from Draft to Merged.
- **Change Target**: Points a change at a specific record type or file.
- **Patch Op**: Atomic, typed mutation instruction. Types: `set_field`, `add_field`, `remove_field`, `rename_field`, `edit_file`.
- **Snapshot**: Pre-execution schema capture for each record type touched by a change.
- **Workflow**: Trigger-driven step execution with approval gating and record mutations.

## State Machine

```
Draft → Implementing → WorkspaceRunning → Validating → Ready → Merged (terminal, immutable)
                                                      ↘ ValidationFailed (on execution failure)
```

- Targets can only be added in Draft.
- Patch ops can be added in Draft, Implementing, WorkspaceRunning, ValidationFailed.
- Merge triggers 3-phase execution (Load → Transform → Persist).
- Merged changes are immutable. No modifications. No re-execution.

### Execute vs Merge

`/execute` is a **manual execution hook** used for:
- Testing patch ops against live record types
- Pre-merge validation and dry runs
- Does NOT change the change status

`/merge` is the **authoritative lifecycle transition**:
- Always triggers the 3-phase execution engine
- Is terminal and immutable — represents production application of the change
- On failure, sets status to `ValidationFailed` (not `Merged`)

Future UX may hide `/execute` behind merge/approval flows, but execution semantics must remain unchanged.

## Execution Model (3-Phase Patch Op Engine)

**Phase 1 — Load:**
- Resolve targets to record types.
- Validate project consistency: `rt.projectId === change.projectId` (abort on mismatch).
- Load base types for protected field resolution.

**Phase 2 — Transform (pure, no DB writes):**
- Apply each op against in-memory schema.
- Validate field existence, type, protection.
- On ANY error → return failure, zero DB writes.

**Phase 3 — Persist (only if Phase 2 succeeds for ALL ops):**
- `ensureSnapshot()` per record type (idempotent).
- `updateRecordTypeSchema()` per record type.
- Stamp each op with `previous_snapshot` and `executed_at`.

## System Invariants

### Tenant
- Tenant resolved server-side from slug. No client-supplied UUIDs trusted.
- All data access filtered by `tenant_id` at the SQL level.
- No sessions, cookies, or body-supplied tenant IDs.

### Project
- Record types must have `project_id NOT NULL`.
- Changes must have `project_id`.
- Base types must belong to the same project and tenant as the derived record type (enforced in `recordTypeService`).
- Patch op targets must belong to the same project as their parent change (fail-fast in `patchOpService`).
- Execution validates cross-project consistency (reject mismatches).
- Snapshots inherit `project_id` from the change, not the record type.

### Execution
- Executed changes are immutable (enforced in `patchOpExecutor`, `changeService`, `patchOpService`).
- Cannot execute a change twice (enforced in `patchOpExecutor` — rejects if any op has `executedAt` set).
- Executed patch ops cannot be deleted (409).
- Execution is all-or-nothing (atomic).
- Execution is deterministic (same inputs → same outputs).
- Snapshots captured before mutation.
- Base-type protected fields cannot be weakened, removed, or renamed.

### Data
- One snapshot per change + record type key (unique constraint).
- Field types constrained to: string, number, boolean, reference, choice, text, date, datetime.
- No duplicate pending patch ops for the same field within a change (409).

## Why This Platform, Not ServiceNow

| Concern | ServiceNow | EC3L |
|---------|-----------|------|
| Configuration | Mutable in place | Explicit, versioned changes |
| Side effects | Implicit, UI-triggered | Deterministic, declared via patch ops |
| History | Weak audit trails, after-the-fact | Immutable snapshots baked into execution |
| Interface | UI-driven, form-coupled | API-first, agent-friendly |
| State reasoning | Difficult — hidden dependencies | Transparent — state machine + invariants |
| Execution model | Promote and pray | Safe-by-default, all-or-nothing |

This platform treats configuration like source code, not form input.

## Architecture

- **Express** backend with PostgreSQL (Drizzle ORM).
- **Tenant middleware** on all `/api/*` routes: `x-tenant-id` → slug lookup → UUID → `req.tenantContext`.
- **Tenant storage** factory: `getTenantStorage(ctx)` returns closured, tenant-scoped DB accessor.
- **Service layer**: changeService, patchOpService, recordTypeService, workflowEngine, etc.
- **Executor**: `server/executors/patchOpExecutor.ts` — 3-phase engine.
- **Runner**: Separate process for module execution boundary enforcement.
- **Tests**: Vitest with fully mocked storage (no DB required).

## Key Files

- `shared/schema.ts` — All table definitions, Zod schemas, TypeScript types.
- `server/routes.ts` — All route handlers.
- `server/middleware/tenant.ts` — Tenant resolution middleware.
- `server/tenantStorage.ts` — Tenant-scoped data access.
- `server/services/changeService.ts` — Change CRUD + merge flow.
- `server/services/patchOpService.ts` — Patch op CRUD + guards.
- `server/services/recordTypeService.ts` — Record type creation + validation.
- `server/executors/patchOpExecutor.ts` — 3-phase execution engine.
- `server/services/__tests__/` — All unit tests.

## RBAC

- Permissions: `form.view`, `form.edit`, `workflow.execute`, `workflow.approve`, `override.activate`, `change.approve`, `admin.view`.
- Default roles: Admin (all), Editor (form + workflow + override), Viewer (form.view).
- Agent guard: actors with `actorType: "agent"` cannot perform approval or privileged actions (403).
- System actors bypass RBAC.

## Planned Extensions (Guardrails — Do Not Implement)

The following are recognized future surface area. None are implemented. All must reuse the core pipeline: **Change → Target → PatchOp → Execute**.

- Task / subtask execution graphs
- CMDB-style relationship modeling
- Workflow engines built on patch ops
- Agent-driven authoring (Replit-like UX)
- AI chat as a change author, never an executor
- External system sync (Git, Terraform, CI/CD)

Do not build any of these. Do not lay groundwork for them. Do not add schema, routes, or abstractions in anticipation. When the time comes, they will compose from existing primitives.

## What NOT to Do

- Do not introduce Express sessions, cookies, or client-supplied tenant IDs.
- Do not allow mutations to Merged changes.
- Do not skip project validation during execution.
- Do not derive snapshot project_id from the record type (use the change's project_id).
- Do not allow duplicate patch ops for the same field in a change.
- Do not delete executed patch ops.
- Do not add nullable foreign keys on core entities that logically require a parent.
- Do not write to the database during the Transform phase of execution.
- Do not implement planned extensions or lay groundwork for them.
- Do not let AI agents execute changes — agents may author, humans approve and merge.
- Do not conflate `/execute` (testing) with `/merge` (production transition).
```

---

## Usage Notes

This prompt is designed to be pasted at the start of a new AI session. It provides:

1. **Platform purpose** — what EC3L is and why it exists.
2. **Primitive definitions** — the building blocks.
3. **State machine** — how changes flow.
4. **Execution model** — the 3-phase engine in detail.
5. **Invariants** — hard constraints that must never be violated.
6. **Architecture** — where code lives and how it connects.
7. **Anti-patterns** — explicit list of things not to do.

For deeper reference, point the session to:
- `ai-context/02-invariants.md` — full invariant catalog with enforcement points.
- `ai-context/04-api-contracts.md` — request/response examples for all key endpoints.
- `ai-context/05-known-bugs-and-fixes.md` — historical bugs and their root causes.
- `ai-context/06-testing-playbook.md` — curl-based integration test flows.
