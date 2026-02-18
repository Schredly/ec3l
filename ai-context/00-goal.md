# 00 — Goal

## North Star

Build a ServiceNow-class enterprise control plane that:

- Treats metadata changes as first-class, auditable units
- Is stateless, deterministic, and safe by default
- Enables agent-driven development ("vibe coding") without sacrificing governance
- Scales from CLI → UI → AI agents using the same primitives

This system prioritizes **correctness, auditability, and execution safety** over UI convenience.

## Mission

EC3L is a **stateless, multi-tenant control plane** for managing structured metadata changes across enterprise environments. It provides deterministic, auditable, and reversible mutation of platform primitives — record types, workflows, forms, and configuration — through a change-management discipline inspired by ServiceNow but rebuilt for clarity.

The platform exists to answer one question:

> **How do you let multiple tenants safely evolve their metadata schemas without breaking production state?**

## Why Not ServiceNow

ServiceNow is a monolithic platform where changes are applied through update sets, XML exports, and opaque commit records. Its mutation model is:

- Non-deterministic (order-dependent XML merges)
- Difficult to audit (no pre/post snapshots by default)
- Coupled to UI (changes require navigating forms)
- Tenant isolation is implicit (instance-per-tenant, not true multi-tenancy)

EC3L replaces this with:

| Concern | ServiceNow | EC3L |
|---------|-----------|------|
| Change unit | Update set (XML blob) | Change record with typed PatchOps |
| Mutation model | Imperative, order-dependent | Declarative, deterministic, idempotent |
| Audit trail | After-the-fact logs | Pre-execution snapshots baked into the model |
| Multi-tenancy | Instance isolation | Shared infrastructure, tenant-scoped at query layer |
| Execution | Implicit on promote | Explicit execute or merge with 3-phase engine |
| Rollback | Manual XML revert | Snapshot-based (schema before mutation is persisted) |
| Configuration | Mutable in place | Explicit, versioned, immutable after merge |
| Interface | UI-driven, form-coupled | API-first, agent-friendly |
| State reasoning | Hidden dependencies | Transparent state machine with enforced invariants |

This platform treats configuration like source code, not form input.

## Why Primitives Matter

The system is built on a small set of **core primitives** rather than a large surface of special-case features:

| Primitive | Purpose |
|-----------|---------|
| **Identity** | Tenant and actor resolution. No sessions. No cookies. Header-derived, server-verified. |
| **Workflow** | Trigger-driven step execution with approval gating, record mutations, and pause/resume. |
| **Change** | The unit of work. Groups targets and patch ops. Flows through a state machine from Draft to Merged. |
| **Record Type** | Project-scoped metadata definitions with typed fields, base-type inheritance, and schema validation. |
| **PatchOp** | Atomic, typed mutation instructions (`set_field`, `add_field`, `remove_field`, `rename_field`, `edit_file`). Staged, validated, then executed as a batch. |

Every feature in the platform composes from these primitives. There are no special-purpose mutation APIs — all schema changes flow through the Change + PatchOp pipeline. This makes the system:

- **Auditable** — every mutation has a change record, a snapshot, and a patch op trail.
- **Deterministic** — the same set of patch ops applied to the same base schema produces the same result.
- **Reversible** — snapshots capture pre-execution state for every affected record type.
- **Enforceable** — invariants (tenant isolation, project scoping, immutability after execution) are structural, not policy-based. Base-type inheritance (P6) and patch op targets (P7) are validated for project and tenant consistency at creation time. Merged changes (E1) and already-executed ops (E2) are rejected by the executor before any work begins.

## Design Philosophy

1. **No magic.** Every state transition is explicit. Every mutation is a named operation.
2. **No trust.** Tenant IDs come from server-side resolution, never from client bodies. Executed changes are immutable.
3. **No ambiguity.** Patch ops declare exactly what they change. Duplicate detection prevents conflicting ops in the same change.
4. **No coupling.** The control plane (metadata management) is separated from the execution layer (runner) and the presentation layer (client).

## Planned Extensions (Guardrails — Do Not Implement)

The following are recognized future surface area. None are implemented. All must compose from the core pipeline: **Change → Target → PatchOp → Execute**.

- Task / subtask execution graphs
- CMDB-style relationship modeling
- Workflow engines built on patch ops
- Agent-driven authoring (Replit-like UX)
- AI chat as a change author, never an executor
- External system sync (Git, Terraform, CI/CD)

Do not build any of these prematurely. When the time comes, they will reuse existing primitives.
