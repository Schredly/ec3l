# 07 — ServiceNow Comparison

For enterprise architects evaluating ChangeOps (EC3L) against ServiceNow's configuration management model.

---

## Change Isolation

| Concern | ServiceNow | ChangeOps |
|---------|-----------|-----------|
| Change unit | Update Set — an XML container of arbitrary record changes | Change Record — a typed container of targets and patch ops scoped to one project |
| Scope | Instance-wide; update sets can touch any table, any scope | Project-scoped; a change belongs to exactly one project and can only target record types within that project |
| Concurrency | Multiple update sets can modify the same record simultaneously; conflicts detected on promotion (too late) | Duplicate field guard rejects conflicting ops at creation time (409); cross-change conflicts detectable via snapshot comparison |
| Tenant isolation | Instance-per-tenant (separate deployments) | Shared infrastructure; tenant scoping enforced at middleware, storage, and executor layers via UUID resolution |
| Blast radius | An update set can modify system tables, UI policies, business rules, and data in a single commit | A change can only mutate record type schemas via typed patch ops; no direct table writes, no system-level side effects |

### Key Difference

ServiceNow treats a change as a bag of XML diffs. ChangeOps treats a change as a typed, validated, project-scoped unit of work where every mutation is declared explicitly.

---

## Immutability

| Concern | ServiceNow | ChangeOps |
|---------|-----------|-----------|
| Post-promotion edits | Update sets can be reopened and modified after promotion in some configurations | Merged changes are immutable — no targets added, no ops added/deleted, no status change |
| Audit trail durability | Audit records exist but are separate from the change; the update set XML can be manually edited | Executed ops carry `previous_snapshot` and `executed_at` as permanent columns; snapshots are immutable once written |
| Deletion of applied changes | Possible (delete the update set record) | Impossible — executed patch ops return 409 on DELETE; merged change status cannot be reverted |

### Key Difference

In ServiceNow, immutability is a policy choice. In ChangeOps, it is a structural constraint enforced by the database and service layer. There is no admin override that weakens it.

---

## Branching vs Update Sets

| Concern | ServiceNow Update Sets | ChangeOps Changes |
|---------|----------------------|-------------------|
| Branching model | None — update sets are linear containers; no forking, no parallel branches | Each change is independent; multiple changes can target the same record type in parallel |
| Conflict resolution | Manual XML merge during promotion; silent overwrites possible | Duplicate field guard prevents same-field conflicts within a change; cross-change conflicts are detectable via snapshot diff |
| Environment promotion | Update set XML exported and imported between instances (dev → test → prod) | Changes execute against the current project state; environment isolation via `environment_id` on changes (in progress) |
| Rollback | Back out update set — re-imports the previous XML state; fragile if other changes have been applied since | No rollback primitive; reversal is accomplished via a new change with compensating ops (e.g., `remove_field` to undo `add_field`) |
| Preview / dry run | Limited — preview mode shows XML diffs but does not validate constraints | `POST /execute` runs the full 3-phase engine without changing status; validates constraints, creates snapshots, returns success/failure |

### Key Difference

ServiceNow's update sets are promotion-oriented (move XML between instances). ChangeOps changes are execution-oriented (validate and apply in place). There is no import/export step — execution is the promotion.

---

## Replay, Rollback, and Auditability

### Replay

| Concern | ServiceNow | ChangeOps |
|---------|-----------|-----------|
| Replay mechanism | Re-import the update set XML into a target instance | Replay = re-execute the change's ops against the base schema captured in snapshots |
| Determinism | Non-deterministic — XML merge behavior depends on target instance state, customization, and order of import | Deterministic — same base schema + same ordered ops = same result (invariant E5) |
| Partial replay | Not supported; update sets are all-or-nothing at the XML level | Not supported at the API level; execution is all-or-nothing (invariant E4). Partial replay could be built from snapshot + op history. |

### Rollback

| Concern | ServiceNow | ChangeOps |
|---------|-----------|-----------|
| Native rollback | "Back out" feature — generates reverse XML | No native rollback — reversal is a new change with inverse ops |
| Rollback safety | Fragile — back-out can fail if dependent changes were applied; no structural guarantee | Safe by design — compensating change goes through the same validation pipeline; base-type protections and duplicate guards still apply |
| Rollback auditability | Back-out creates a new update set (sometimes) | Compensating change is a first-class auditable record with its own snapshots and executed ops |

### Auditability

| Concern | ServiceNow | ChangeOps |
|---------|-----------|-----------|
| What changed | Audit log records (after-the-fact, may be incomplete) | `previous_snapshot` on every executed op records pre-mutation schema; `executed_at` records when |
| Who changed it | `sys_update_name` field on the update set | Tenant context (`x-user-id` / `x-agent-id` headers); RBAC audit logs record allow/deny decisions |
| Change lineage | Update set → target table; no structured relationship | Change → Targets → PatchOps → Snapshots; fully relational, queryable |
| Cross-change impact | Difficult to trace; requires manual XML diff | Snapshot chain enables: "what was the schema before change X?" for any record type, at any point in history |

---

## Summary for Decision Makers

| Dimension | ServiceNow | ChangeOps |
|-----------|-----------|-----------|
| Change model | XML blobs, manual promotion | Typed ops, deterministic execution |
| Isolation | Instance-per-tenant | Query-level tenant + project scoping |
| Immutability | Policy-based | Structurally enforced |
| Conflict handling | Post-promotion merge | Pre-execution duplicate guard |
| Auditability | After-the-fact logs | Snapshots + op history baked into the model |
| Rollback | Fragile XML back-out | Forward-only compensating changes |
| Replay | Non-deterministic XML re-import | Deterministic op replay |
| Extensibility | Script includes, UI policies, business rules | Primitives compose: Change → Target → PatchOp → Execute |

ChangeOps is not a ServiceNow replacement. It is a re-imagining of the configuration management layer as a **stateless, API-first, deterministic control plane** where safety is structural, not procedural.
