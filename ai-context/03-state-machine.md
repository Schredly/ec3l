# 03 — State Machine

## Change Record States

```
┌─────────┐
│  Draft  │ ← initial state on creation
└────┬────┘
     │  POST /api/changes/:id/status → "Implementing"
     ▼
┌──────────────┐
│ Implementing │
└──────┬───────┘
       │  POST /api/changes/:id/start-workspace
       ▼
┌──────────────────┐
│ WorkspaceRunning │
└──────┬───────────┘
       │  POST /api/changes/:id/status → "Validating"
       ▼
┌────────────┐
│ Validating │
└─────┬──────┘
      │
      ├─── validation succeeds ──►  POST /api/changes/:id/checkin
      │                                      │
      │                              ┌───────▼──────┐
      │                              │    Ready     │
      │                              └───────┬──────┘
      │                                      │  POST /api/changes/:id/merge
      │                                      ▼
      │                              ┌──────────────┐
      │                              │   Merged     │ ← TERMINAL, IMMUTABLE
      │                              └──────────────┘
      │
      └─── execution fails ────►  ┌────────────────────┐
                                   │ ValidationFailed  │
                                   └────────────────────┘
                                     (can retry by restarting workspace)
```

## State Definitions

| State | Description | Mutable? | Can Add Targets? | Can Add PatchOps? | Can Execute? |
|-------|-------------|----------|-------------------|-------------------|--------------|
| `Draft` | Initial state. Change is being assembled. | Yes | Yes | Yes | No |
| `Implementing` | Development in progress. | Yes | No | Yes | No |
| `WorkspaceRunning` | Active workspace for code changes. | Yes | No | Yes | No |
| `Validating` | Awaiting validation/review. | Yes | No | No | No |
| `ValidationFailed` | Execution failed during merge attempt. | Yes | No | Yes | No |
| `Ready` | Approved and ready for merge. | Limited | No | No | No |
| `Merged` | Executed and finalized. | **No** | **No** | **No** | N/A (done) |

## Allowed Transitions

| From | To | Trigger | Guards |
|------|----|---------|--------|
| `Draft` | `Implementing` | `POST /status` | None |
| `Implementing` | `WorkspaceRunning` | `POST /start-workspace` | Module boundary check |
| `WorkspaceRunning` | `Validating` | `POST /status` | None |
| `Validating` | `Ready` | `POST /checkin` | RBAC: `change.approve` |
| `Ready` | `Merged` | `POST /merge` | RBAC: `change.approve`; Agent guard; Executes all patch ops |
| `Validating` | `ValidationFailed` | Automatic | Triggered when execution fails during merge |
| `Ready` | `ValidationFailed` | Automatic | Triggered when execution fails during merge |
| `ValidationFailed` | `WorkspaceRunning` | `POST /start-workspace` | Blocked — current impl prevents restart from this state |

## Forbidden Transitions

| Transition | Reason |
|------------|--------|
| `Merged` → any state | Merged changes are immutable. Terminal state. |
| Any state → `Draft` | Draft is an entry state only. No regression to Draft. |
| `Draft` → `Merged` | Cannot skip the approval pipeline. |
| `Draft` → `Ready` | Must go through implementation and validation. |

## Execution Semantics

### Execute vs Merge — Critical Distinction

These two endpoints invoke the same 3-phase engine but have fundamentally different roles:

| | `/execute` | `/merge` |
|---|-----------|----------|
| Purpose | Testing, validation, pre-merge dry runs | Production application of the change |
| Status change | None | → `Merged` (success) or → `ValidationFailed` (failure) |
| Terminal? | No | Yes — `Merged` is immutable |
| When to use | During development, before approval | After approval, as the final lifecycle step |

Future UX may hide `/execute` behind merge/approval flows, but execution semantics must remain unchanged. `/merge` is always the authoritative lifecycle transition.

### On Merge (Primary Path)

When `POST /api/changes/:id/merge` is called:

1. Service calls `executePatchOps(ctx, changeId)`.
2. Executor runs 3-phase pipeline (Load → Transform → Persist).
3. **Success path:** All ops applied. Status set to `Merged`. Workspace stopped.
4. **Failure path:** Any op fails in Transform phase. Zero DB writes. Status set to `ValidationFailed`. HTTP 422 returned.

### On Execute (Standalone)

`POST /api/changes/:id/execute` runs the same 3-phase executor but does **not** change the change status. This allows testing execution without committing to a merge.

## Patch Op Lifecycle Within a Change

### Sub-States

A patch op exists in one of three states, determined by its column values:

| State | `executed_at` | `previous_snapshot` | Meaning |
|-------|--------------|---------------------|---------|
| **Pending** | `NULL` | `NULL` | Staged, awaiting execution. Mutable (can be deleted). |
| **Executed** | Timestamp | Schema JSON | Successfully applied. Immutable. Cannot be deleted or re-stamped. |
| **Failed** | `NULL` | `NULL` | Transform phase rejected this op. Change status → `ValidationFailed`. Op remains pending for retry. |

```
┌──────────┐   POST /patch-ops    ┌─────────┐
│  (none)  │ ──────────────────►  │ Pending │
└──────────┘                      └────┬────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
              DELETE /patch-ops   POST /merge         POST /execute
                    │              or /execute         (transform fails)
                    ▼                  │                  │
              ┌─────────┐             ▼                  ▼
              │ Deleted │       ┌──────────┐       ┌────────┐
              └─────────┘       │ Executed │       │ Failed │
                                └──────────┘       └────┬───┘
                                     │                  │
                                Cannot delete (409)     │
                                Cannot re-stamp         │
                                Audit trail locked      │
                                                        │
                                            Op stays Pending.
                                            Change → ValidationFailed.
                                            Fix and retry via new /merge or /execute.
```

### Failure Semantics

When the executor rejects an op during Phase 2 (Transform):

1. **Zero database writes occur.** The all-or-nothing invariant (E4) means no ops are persisted, no snapshots are written, no schemas are mutated.
2. **The change status transitions to `ValidationFailed`** (if triggered via `/merge`). Via `/execute`, status is unchanged.
3. **All ops remain in `Pending` state.** The failed op is not marked — it stays alongside its siblings, ready for correction.
4. **The error message identifies the failing op.** The executor returns `{ success: false, error: "..." }` with a human-readable description of the constraint violation.

### Retry vs Fork

| Strategy | When to use | Mechanism |
|----------|------------|-----------|
| **Retry in place** | The failure is correctable (e.g., wrong field type, missing field). | Delete the bad op, create a corrected op, re-execute. |
| **Fork to new change** | The failure reveals a design conflict that requires rethinking multiple ops. | Create a new change with a clean op set. The original change can be abandoned (left in `ValidationFailed`). |

There is no "rollback" operation. Pending ops can be deleted and recreated. Executed ops are permanent. If a change partially needs to be undone after merge, the correct approach is a **new change** with compensating ops (e.g., `remove_field` to undo an `add_field`).

### Why Immutability — No Silent Rollback

Executed patch ops are immutable for three reasons:

1. **Audit integrity.** The `previous_snapshot` on an executed op is the authoritative record of what the schema looked like before this mutation. Deleting or modifying it destroys the audit chain.
2. **Deterministic replay.** Given a sequence of changes with their executed ops, the system can reconstruct any point-in-time schema state. Mutable ops make replay non-deterministic.
3. **Cross-change safety.** Subsequent changes may have been authored against the schema produced by this op. Silently rolling back the op would invalidate those downstream changes without warning.

The only way to reverse a mutation is forward: create a new change with inverse ops.

### Patch Op Guards

| Action | Guard | Error |
|--------|-------|-------|
| Create | Duplicate field detection (same recordType + field in change) | 409 |
| Create | Field type validation | 400 |
| Create | Op type must match target type | 400 |
| Delete | Change must not be Merged | 400 |
| Delete | Op must not be executed (`executed_at` null) | 409 |
| Delete | Op must belong to requesting tenant | 404 |
| Delete | Op must belong to specified change | 400 |

## Why Immutability Matters

### Audit Integrity
Once a change is merged, its patch ops and snapshots form a permanent audit record. If merged changes could be modified, the audit trail would be unreliable. Every compliance question — "what changed, when, and by whom?" — depends on this immutability.

### Deterministic Replay
Because merged changes are frozen, they can theoretically be replayed against a base schema to reproduce the same outcome. Mutable post-execution changes would make replay non-deterministic.

### Snapshot Validity
Snapshots capture the schema **before** execution. If patch ops could be added or removed after execution, the relationship between snapshots and ops would break. The snapshot would no longer represent the true pre-state.

### Cross-Change Safety
Changes are independent units of work. If a merged change could be modified, it could retroactively affect the base state that subsequent changes were built against. Immutability guarantees that the base state for any future change is stable.

## Workflow Execution States (Separate State Machine)

Workflows have their own lifecycle, independent of changes:

```
┌──────────┐
│ Running  │ ← started by trigger or manual execution
└────┬─────┘
     │
     ├─── all steps complete ──► ┌───────────┐
     │                            │ Completed │
     │                            └───────────┘
     ├─── step requires approval ──► ┌────────┐
     │                                │ Paused │
     │                                └───┬────┘
     │                                    │ POST /resume (RBAC: workflow.approve)
     │                                    ▼
     │                              ┌──────────┐
     │                              │ Running  │ (resumes from paused step)
     │                              └──────────┘
     │
     └─── step fails ──► ┌────────┐
                          │ Failed │
                          └────────┘
```

### Workflow Step States

| State | Meaning |
|-------|---------|
| `pending` | Not yet executed |
| `awaiting_approval` | Step requires human approval before proceeding |
| `completed` | Step executed successfully |
| `failed` | Step execution failed |

### Workflow Intent States

| State | Meaning |
|-------|---------|
| `pending` | Intent created, not yet dispatched |
| `dispatched` | Intent matched to execution |
| `failed` | Dispatch failed |
| `duplicate` | Idempotency key collision — silently dropped |
