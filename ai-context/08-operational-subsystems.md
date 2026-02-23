# 08 — Operational Subsystems

This document covers the runtime and operational services built on top of the core change-management primitives (documented in 00–04). These subsystems handle record instance lifecycle, event-driven reactions, telemetry, assignment routing, SLA enforcement, and graph contract validation.

**Living document.** Update this file as new subsystems are added or existing ones evolve.

---

## Service Catalog

| Service | File | Purpose |
|---------|------|---------|
| changeService | `server/services/changeService.ts` | Change CRUD, status transitions, merge flow |
| patchOpService | `server/services/patchOpService.ts` | Patch op CRUD, duplicate guard, deletion guards |
| recordTypeService | `server/services/recordTypeService.ts` | Record type creation, base-type validation, activation |
| recordInstanceService | `server/services/recordInstanceService.ts` | Record instance CRUD, auto-assignment, SLA timer creation |
| workflowEngine | `server/services/workflowEngine.ts` | Step execution, approval gating, pause/resume, SLA breach subscription |
| workflowService | `server/services/workflowService.ts` | Workflow definition CRUD |
| domainEventService | `server/services/domainEventService.ts` | Domain event bus: DB telemetry write + in-memory pub-sub |
| telemetryService | `server/services/telemetryService.ts` | Low-level telemetry writer (internal — prefer domainEventService) |
| assignmentService | `server/services/assignmentService.ts` | Pure-logic assignment resolver (static_user, static_group, field_match) |
| timerService | `server/services/timerService.ts` | SLA timer processing: marks due timers as breached |
| triggerService | `server/services/triggerService.ts` | Trigger CRUD, record event matching, manual trigger firing |
| intentDispatcher | `server/services/intentDispatcher.ts` | Dispatches workflow execution intents to the engine |
| changeTargetService | `server/services/changeTargetService.ts` | Change target CRUD, project-id derivation |
| rbacService | `server/services/rbacService.ts` | Role-based access control, permission checks |
| agentGuardService | `server/services/agentGuardService.ts` | Blocks agents from privileged actions |
| agentProposalService | `server/services/agentProposalService.ts` | Agent proposal lifecycle |
| agentRunService | `server/services/agentRunService.ts` | Agent run lifecycle |
| auditFeedService | `server/services/auditFeedService.ts` | Unified audit feed: merges change events, RBAC logs, telemetry |
| environmentService | `server/services/environmentService.ts` | Environment management |
| formService | `server/services/formService.ts` | Form definition CRUD |
| installService | `server/services/installService.ts` | Tenant bootstrap and seed |
| hrLiteInstaller | `server/services/hrLiteInstaller.ts` | HR Lite template installer |
| moduleService | `server/services/moduleService.ts` | Module definition management |
| overrideService | `server/services/overrideService.ts` | Configuration override lifecycle |
| projectService | `server/services/projectService.ts` | Project CRUD |
| schedulerService | `server/services/schedulerService.ts` | Scheduled job management |
| templateService | `server/services/templateService.ts` | Template management |
| workspaceService | `server/services/workspaceService.ts` | Workspace lifecycle for changes |
| graphContracts | `server/graph/graphContracts.ts` | Pure types: GraphNode, RecordTypeNode, EdgeDefinition, Bindings, GraphSnapshot |
| graphRegistryService | `server/graph/graphRegistryService.ts` | Builds tenant-scoped GraphSnapshot from existing tables |
| graphValidationService | `server/graph/graphValidationService.ts` | Pure validators: orphan detection, cycle detection, cross-project baseType, field uniqueness, binding validation |
| mergeGraphValidator | `server/graph/mergeGraphValidator.ts` | Bridge between executor cache and graph validation; runs at merge boundary |
| graphService | `server/graph/graphService.ts` | Admin introspection: project-scoped snapshot, summary, and validation |
| promotionService | `server/graph/promotionService.ts` | Environment-scoped package state, cross-environment diff, and promotion |
| promotionIntentService | `server/graph/promotionIntentService.ts` | Governed promotion lifecycle: draft → previewed → approved → executed |
| notificationService | `server/services/notificationService.ts` | Best-effort webhook delivery: `sendWebhook` (never throws), Slack-compatible payload builders for promotion approval + execution |
| vibeService | `server/vibe/vibeService.ts` | Vibe authoring: prompt → LLM adapter → Zod validation → namespace guard → preview → install delegation; refinement via LLM with deterministic fallback |
| vibeTemplates | `server/vibe/vibeTemplates.ts` | Starter app templates: onboarding, PTO, vendor intake, ticketing |
| vibeDraftService | `server/vibe/vibeDraftService.ts` | Server-side draft persistence: create → refine → preview → install lifecycle with tenant-scoped storage |
| llmAdapter | `server/vibe/llmAdapter.ts` | LLM adapter interface + Anthropic/OpenAI/stub implementations; returns `unknown` for untrusted-output contract; generate, repair, and refine methods |
| graphPackageSchema | `server/vibe/graphPackageSchema.ts` | Zod strict schema for runtime GraphPackage validation; rejects unknown fields from LLM output |
| promptBuilder | `server/vibe/promptBuilder.ts` | Structured prompt builders for JSON-only LLM output matching GraphPackage schema |
| repairService | `server/vibe/repairService.ts` | Preview repair loop: generate → validate → retry with errors → preview (never install) |
| draftPatchOps | `server/vibe/draftPatchOps.ts` | Pure patch op engine for surgical draft edits: add/rename/remove fields, set SLA, set assignment group |
| draftVersioning | `server/vibe/vibeDraftService.ts` (version methods) | Draft version history: auto-snapshot on create/refine/patch, restore to previous versions, monotonic numbering per draft |
| multiVariantService | `server/vibe/multiVariantService.ts` | Multi-variant AI generation: N parallel LLM calls, Zod + namespace validation, graph projection, diff + checksum per variant. Exploration-only — never creates drafts or mutates graph |
| variantDiffService | `server/vibe/variantDiffService.ts` | Variant-to-variant diff: projects two packages onto shared snapshot, returns diff between the projections. Pure comparison — never mutates |
| tokenStreamService | `server/vibe/tokenStreamService.ts` | Token-level LLM streaming: streams tokens via AsyncGenerator, accumulates buffer, extracts JSON, validates, repair loop, project/diff. Emits SSE events (token/stage/complete/error). Preview-only — never creates drafts or installs |
| draftVersionDiffService | `server/vibe/draftVersionDiffService.ts` | Draft version-to-version diff: loads two version snapshots, projects both onto shared graph snapshot, diffs projections. Read-only — works on any draft status |
| vibeStudio (UI) | `client/src/pages/vibe-studio.tsx` | Admin-only UI for vibe authoring: draft list, create/refine/preview/install, inline edit, version history, variant compare + diff, adopt variant, token streaming output, diff viewer, validation errors |
| vibeApi (client) | `client/src/lib/api/vibe.ts` | Typed client API helpers for all vibe draft endpoints |
| promotionApi (client) | `client/src/lib/api/promotion.ts` | Typed client API helpers for promotion intent + environment endpoints |

---

## Domain Event System

**File:** `server/services/domainEventService.ts`

The domain event bus provides two channels from a single `emitDomainEvent()` call:

1. **DB persistence** — writes to `execution_telemetry_events` for audit and analytics.
2. **In-memory pub-sub** — notifies registered handlers for lightweight in-process reactions.

### Event Types

```typescript
type DomainEventType =
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "workflow.intent.started"
  | "workflow.intent.completed"
  | "workflow.intent.failed"
  | "record.assigned"
  | "record.sla.created"
  | "record.sla.breached"
  | "graph.validation_failed"
  | "graph.validation_succeeded"
  | "graph.diff_computed"
  | "graph.package_installed"
  | "graph.package_install_noop"
  | "graph.package_install_rejected"
  | "graph.package_promoted"
  | "graph.promotion_intent_created"
  | "graph.promotion_intent_previewed"
  | "graph.promotion_intent_approved"
  | "graph.promotion_intent_executed"
  | "graph.promotion_intent_rejected"
  | "vibe.llm_generation_requested"
  | "vibe.llm_generation_succeeded"
  | "vibe.llm_generation_failed"
  | "vibe.llm_repair_attempted"
  | "vibe.llm_refinement_requested"
  | "vibe.llm_refinement_succeeded"
  | "vibe.llm_refinement_failed"
  | "vibe.draft_discarded"
  | "vibe.draft_patched"
  | "vibe.draft_version_created"
  | "vibe.draft_restored"
  | "vibe.variant_generation_requested"
  | "vibe.variant_generation_completed"
  | "vibe.draft_created_from_variant"
  | "vibe.variant_diff_computed"
  | "vibe.draft_variant_adopted"
  | "vibe.llm_token_stream_started"
  | "vibe.llm_token_stream_completed"
  | "vibe.llm_token_stream_failed"
  | "vibe.draft_version_diff_computed"
  | "graph.promotion_notification_sent"
  | "graph.promotion_notification_failed";
```

### Event Structure

```typescript
interface DomainEvent {
  type: DomainEventType;
  status: string;
  entityId: string;
  workflowId?: string | null;
  workflowStepId?: string | null;
  moduleId?: string;              // defaults to "system"
  error?: { code?: string; message: string };
  affectedRecords?: Record<string, unknown> | unknown[] | null;
}
```

### Derived Fields (computed by emitDomainEvent)

| Field | Derivation |
|-------|-----------|
| `actorType` | `ctx.agentId` → "agent", `ctx.userId` → "user", else "system" |
| `actorId` | `ctx.agentId ?? ctx.userId ?? null` |
| `executionType` | `event.workflowId` present → "workflow_step", else "task" |

### In-Memory Pub-Sub

```typescript
// Register a handler for a specific event type
const unsubscribe = subscribe("record.sla.breached", (ctx, event) => { ... });

// Remove a specific handler
unsubscribe();

// Remove all handlers (test isolation)
clearSubscribers();
```

**Error isolation:** Each handler is dispatched via `Promise.resolve().then(handler).catch(log)`. A failing handler never affects other handlers or the emitter. Errors are logged to console with `[domain-event] Subscriber error for {type}`.

**Fire-and-forget contract:** `emitDomainEvent` is synchronous. Both the DB write and subscriber notifications are non-blocking. The function never throws.

### Active Subscriptions

| Event | Subscriber | Location |
|-------|-----------|----------|
| `record.sla.breached` | Log placeholder for escalation | `workflowEngine.ts` (module-level) |

### Emit Sites

| Caller | Events Emitted |
|--------|---------------|
| `recordInstanceService.createRecordInstance` | `execution_completed` (created), `record.assigned`, `record.sla.created` |
| `recordInstanceService.updateRecordInstance` | `execution_completed` (updated) |
| `timerService.processDueTimers` | `record.sla.breached` |
| `workflowEngine.executeWorkflow` | `workflow.intent.started`, `workflow.intent.completed`, `workflow.intent.failed` |
| `intentDispatcher.dispatchPendingIntents` | `execution_started`, `execution_completed`, `execution_failed` |
| `changeService` (merge flow) | `execution_started`, `execution_completed`, `execution_failed` |
| `patchOpExecutor` (graph validation) | `graph.validation_failed`, `graph.validation_succeeded`, `graph.diff_computed` |
| `installGraphService` (package install) | `graph.package_installed`, `graph.package_install_noop`, `graph.package_install_rejected` |
| `promotionService` (package promotion) | `graph.package_promoted` |
| `promotionIntentService` (intent lifecycle) | `graph.promotion_intent_created`, `graph.promotion_intent_previewed`, `graph.promotion_intent_approved`, `graph.promotion_intent_executed`, `graph.promotion_intent_rejected`, `graph.promotion_notification_sent`, `graph.promotion_notification_failed` |
| `vibeService` (vibe authoring) | `vibe.package_generated`, `vibe.package_installed`, `vibe.llm_generation_requested`, `vibe.llm_generation_succeeded`, `vibe.llm_generation_failed`, `vibe.llm_refinement_requested`, `vibe.llm_refinement_succeeded`, `vibe.llm_refinement_failed` |
| `vibeDraftService` (draft lifecycle) | `vibe.draft_created`, `vibe.draft_refined`, `vibe.draft_previewed`, `vibe.draft_installed`, `vibe.draft_discarded`, `vibe.draft_patched`, `vibe.draft_version_created`, `vibe.draft_restored`, `vibe.draft_created_from_variant`, `vibe.draft_variant_adopted` |
| `repairService` (repair loop) | `vibe.llm_repair_attempted` |
| `multiVariantService` (variant generation) | `vibe.variant_generation_requested`, `vibe.variant_generation_completed` |
| `variantDiffService` (variant diff) | `vibe.variant_diff_computed` |
| `tokenStreamService` (token streaming) | `vibe.llm_token_stream_started`, `vibe.llm_token_stream_completed`, `vibe.llm_token_stream_failed` |
| `draftVersionDiffService` (version diff) | `vibe.draft_version_diff_computed` |

---

## Record Instance Lifecycle

**File:** `server/services/recordInstanceService.ts`

Record instances are runtime data objects created from record type definitions. They are the "rows" to record types' "table definitions."

### Creation Flow

```
POST /api/record-types/:rtId/instances
  │
  ├─ Validate record type exists and belongs to tenant
  │
  ├─ Resolve assignment from record type's assignmentConfig
  │  (see Assignment Routing below)
  │
  ├─ storage.createRecordInstance({ tenantId, recordTypeId, data, createdBy, assignedTo?, assignedGroup? })
  │
  ├─ emitDomainEvent: execution_completed (status: "created")
  │
  ├─ If assignment resolved:
  │    emitDomainEvent: record.assigned
  │
  ├─ If record type has SLA config:
  │    storage.createRecordTimer({ type: "sla_due", dueAt })
  │    emitDomainEvent: record.sla.created
  │
  └─ emitRecordEvent: "record.created" → triggers matching workflows
```

### Update Flow

```
PUT /api/record-instances/:id
  │
  ├─ Validate instance exists and belongs to tenant
  ├─ storage.updateRecordInstance(id, tenantId, { data })
  ├─ emitDomainEvent: execution_completed (status: "updated")
  └─ emitRecordEvent: "record.updated" → triggers matching workflows
```

### Schema

```
record_instances table:
  id, tenantId, recordTypeId, data (JSONB), status,
  createdBy, assignedTo, assignedGroup, createdAt, updatedAt
```

---

## Assignment Routing

**File:** `server/services/assignmentService.ts`

Pure-logic resolver. No side effects. No DB calls. Called during record instance creation.

### Strategies

Assignment is configured per record type via `assignmentConfig` (JSONB column on `record_types`).

| Strategy | Config | Behavior |
|----------|--------|----------|
| `static_user` | `{ type: "static_user", value: "user-42" }` | Always assigns to the specified user |
| `static_group` | `{ type: "static_group", value: "support-team" }` | Always assigns to the specified group |
| `field_match` | `{ type: "field_match", field: "priority", rules: [...], default: {...} }` | Matches a record data field value against rules |

### Field Match Rules

```json
{
  "type": "field_match",
  "field": "priority",
  "rules": [
    { "equals": "critical", "assignUser": "oncall-lead" },
    { "equals": "high", "assignGroup": "senior-support" }
  ],
  "default": { "assignGroup": "general-support" }
}
```

Resolution order:
1. Check if `recordData[field]` matches any rule's `equals` value.
2. If matched: return `assignUser` or `assignGroup` from the rule.
3. If no match: return from `default` block if present.
4. If no default: return `null` (no assignment).

---

## SLA Timer System

**Files:** `server/services/timerService.ts`, `server/services/recordInstanceService.ts`

### Timer Creation (during record instance creation)

If the record type has `slaConfig.durationMinutes > 0`:
- A `record_timers` row is created with `type: "sla_due"` and `dueAt = now + durationMinutes`.
- Status starts as `"pending"`.

### Timer Processing

`processDueTimers(now?, tenantId?)` scans for all timers where `dueAt <= now` and `status = "pending"`:

```
For each due timer:
  1. storage.updateTimerStatus(timer.id, "breached")
  2. emitDomainEvent: record.sla.breached
     (entityId = timer.recordId, affectedRecords = { recordId, timerId })
```

**Idempotent:** Breached timers are not reprocessed (status filter excludes them).
**Fault-tolerant:** Individual timer failures do not halt processing of remaining timers.
**Callable per-tenant or globally** via the optional `tenantId` parameter.

### Timer Schema

```
record_timers table:
  id, tenantId, recordId, type ("sla_due"), status ("pending" | "breached"),
  dueAt, processedAt, createdAt
```

### Processing Endpoint

`POST /api/timers/process` — manually triggers `processDueTimers()` for the request's tenant.

---

## Trigger & Record Event System

**File:** `server/services/triggerService.ts`

### Trigger Types

| Type | Description |
|------|-------------|
| `record_event` | Fires when a matching record event occurs (e.g., `record.created` on record type `incident`) |
| `manual` | Fires when explicitly triggered via API |
| `schedule` | Fires on a cron/interval schedule |

### Record Event Flow

When a record instance is created or updated, `emitRecordEvent` is called:

```
emitRecordEvent(ctx, "record.created", recordTypeKey, recordData)
  │
  ├─ Load all active triggers with triggerType = "record_event"
  │
  ├─ For each trigger:
  │    ├─ Check triggerConfig.recordType matches
  │    ├─ Check triggerConfig.fieldConditions (optional fine-grained matching)
  │    ├─ Check workflow definition is active
  │    └─ Create WorkflowExecutionIntent with idempotency key
  │
  └─ Return matched intents
```

**Idempotency:** Each intent has a deterministic idempotency key built from `trigger.id + workflowDefinitionId + event + recordType + sorted(recordData)`. Duplicate intents are silently dropped by the storage layer.

### Intent Lifecycle

```
pending → dispatched (intentDispatcher picks up and executes)
pending → duplicate  (idempotency key collision)
pending → failed     (dispatch error)
```

---

## Telemetry Architecture

### Two-Layer Design

```
┌─────────────────────────────────────────────────┐
│  domainEventService.emitDomainEvent()           │ ← Public API
│  - Derives actorType, executionType             │
│  - Writes to execution_telemetry_events         │
│  - Notifies in-memory subscribers               │
└─────────────┬───────────────────────────────────┘
              │ (uses storage.createExecutionTelemetryEvent)
              │
┌─────────────▼───────────────────────────────────┐
│  telemetryService.emitTelemetry()               │ ← Internal only
│  - Raw write to execution_telemetry_events      │
│  - No derived fields, no pub-sub                │
│  - @internal — prefer domainEventService        │
└─────────────────────────────────────────────────┘
```

All new code should use `emitDomainEvent`. `telemetryService` exists as a low-level escape hatch.

### Audit Feed

`auditFeedService` provides a unified read view that merges:
- Change events (status transitions, merges)
- RBAC audit logs (permission checks, denials)
- Execution telemetry events (domain events written by `emitDomainEvent`)

---

## Graph Contract Layer (Phase 5)

**Directory:** `server/graph/`

A metadata overlay that makes relationships between record types, fields, workflows, SLAs, and assignments explicit and validatable. No new DB tables — everything is inferred from existing data.

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  graphContracts.ts                                    │
│  Pure types: GraphNode, RecordTypeNode, EdgeDefinition│
│  WorkflowBinding, SLABinding, AssignmentBinding       │
│  GraphSnapshot, GraphValidationError                  │
└──────────────────────────────────────────────────────┘
         ▲                        ▲
         │                        │
┌────────┴──────────┐   ┌────────┴──────────────────┐
│ graphRegistryService│   │ graphValidationService    │
│ buildGraphSnapshot()│   │ validateNoOrphanRecordTypes│
│ Reads: record_types,│   │ validateNoCyclesInBaseType │
│ workflow_defs,      │   │ validateFieldUniqueness    │
│ triggers            │   │ validateBindingTargetsExist│
└─────────────────────┘   └───────────┬────────────────┘
                                      │
                          ┌───────────▼────────────────┐
                          │ mergeGraphValidator.ts      │
                          │ validateGraphForMerge()     │
                          │ Called by patchOpExecutor    │
                          │ between Phase 1 and Phase 2 │
                          └────────────────────────────┘
```

### Merge Boundary Integration

The executor's 3-phase engine now includes a **Phase 1.5** step:

```
Phase 1: Load (build cache of affected record types)
    ↓
Phase 1.5: Graph Validation (pre-mutation)
  1. Load ALL record types in the tenant (cross-project visibility for baseType checks)
  2. Simulate pending ops' effect on fields (add/remove/rename/set)
  3. Build a projected GraphSnapshot
  4. Run all graph validators on the projected snapshot
  5. If errors: emit graph.validation_failed, return { success: false }
  6. If valid: emit graph.validation_succeeded
    ↓
Phase 2: Transform (apply ops in memory)
    ↓
Phase 3: Persist (write to DB)
```

**Zero DB writes on validation failure** — same contract as Phase 2 failures.

### Graph Validators

| Validator | Detects | Error Code |
|-----------|---------|-----------|
| `validateNoOrphanRecordTypes` | baseType references to non-existent record types | `ORPHAN_BASE_TYPE` |
| `validateNoCyclesInBaseType` | Circular inheritance chains (A → B → C → A) | `BASE_TYPE_CYCLE` |
| `validateBaseTypeSameProject` | baseType references across project boundaries | `BASE_TYPE_CROSS_PROJECT` |
| `validateFieldUniquenessPerRecordType` | Duplicate field names within a single record type | `DUPLICATE_FIELD` |
| `validateBindingTargetsExist` | Workflow/SLA/assignment bindings to non-existent record types | `BINDING_TARGET_MISSING` |

### GraphValidationError Shape

```typescript
interface GraphValidationError {
  code: string;                         // Error code (e.g., "ORPHAN_BASE_TYPE")
  message: string;                      // Human-readable description
  nodeKey?: string;                     // Record type key that triggered the error
  field?: string;                       // Field name (for field-level errors)
  recordTypeId?: string;               // DB ID of the record type
  baseTypeKey?: string;                // baseType key (for inheritance errors)
  details?: Record<string, unknown>;   // Structured metadata (e.g., project IDs)
}
```

### Admin Graph Introspection Endpoints

Both endpoints require `admin.view` RBAC permission. Tenant-scoped via middleware.

| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/graph/snapshot?projectId=...` | Returns summary (counts) of the project graph |
| `GET /api/admin/graph/snapshot?projectId=...&full=1` | Returns the full `GraphSnapshot` |
| `GET /api/admin/graph/validate?projectId=...` | Runs all validators on the project graph, returns `{ valid, errors }` |

### GraphSnapshot Structure

```typescript
interface GraphSnapshot {
  tenantId: string;
  builtAt: string;
  nodes: RecordTypeNode[];       // All record types in the project
  fields: FieldDefinitionNode[]; // All fields across all record types
  edges: EdgeDefinition[];       // Inheritance + reference edges
  bindings: {
    workflows: WorkflowBinding[];
    slas: SLABinding[];
    assignments: AssignmentBinding[];
    changePolicies: ChangePolicyBinding[];
  };
}
```

---

## Invariants (Operational Layer)

These extend the invariants in `02-invariants.md`:

**O1. Domain events never throw.**
`emitDomainEvent` is fire-and-forget. Both the DB write and subscriber notifications are wrapped in `.catch()`. A telemetry failure must never break a business operation.

**O2. Subscriber errors are isolated.**
Each pub-sub handler runs in its own microtask. A failing handler cannot affect other handlers or the emitter.

**O3. SLA timer processing is idempotent.**
`processDueTimers` only processes timers with `status = "pending"`. Once breached, a timer is never reprocessed.

**O4. Assignment resolution is pure.**
`resolveAssignment` has no side effects, no DB calls, no telemetry writes. It takes a record type and record data, returns an assignment result or null.

**O5. Record events generate idempotent intents.**
`emitRecordEvent` builds deterministic idempotency keys. The same record creation with the same data will not create duplicate workflow execution intents.

**O6. Timer processing is fault-tolerant.**
A failure to process one timer does not prevent processing of subsequent timers in the same batch.

**O7. Graph validation runs before mutation.**
The graph validator executes between Phase 1 (Load) and Phase 2 (Transform). If the projected post-mutation graph is invalid, the merge fails with zero DB writes — same as Phase 2 failures.

**O8. Graph validators are pure functions.**
All validators in `graphValidationService.ts` operate on `GraphSnapshot` values. They never throw — they return error arrays. The caller decides what to do.

**O9. BaseType references must stay within the same project.**
The merge graph validator loads all record types in the tenant so `validateBaseTypeSameProject` can detect cross-project baseType references (error code `BASE_TYPE_CROSS_PROJECT`). Field projections for pending ops are applied only to the change's project.

**O10. Graph validation success is observable.**
When Phase 1.5 graph validation passes, a `graph.validation_succeeded` domain event is emitted before Phase 2 begins. This enables monitoring and audit of successful validations alongside failures.

**O11. Graph diff is computed at merge time.**
After graph validation succeeds in Phase 1.5, a diff between the current and projected snapshots is computed and emitted as `graph.diff_computed`.

**O12. Graph diff is observable via domain event.**
The diff result is attached to the `graph.diff_computed` domain event for audit and monitoring.

**O13. Graph validation runs before install mutation.**
The install engine builds a projected snapshot, validates it, and only applies mutations if validation passes and `previewOnly` is false.

**O14. Install applies record types in topological order.**
Base types are created before derived types to prevent foreign-key violations and orphan baseType references.

**O15. Install is observable via domain event.**
`graph.package_installed`, `graph.package_install_noop`, and `graph.package_install_rejected` events are emitted for every install attempt.

**O16. Install is idempotent via checksum.**
If the latest audit trail entry for a package has the same SHA-256 checksum, the install returns noop with zero mutations.

**O17. Version guard prevents downgrade.**
Installing a lower version than the latest audit entry is rejected unless `allowDowngrade` is set.

**O18. Install audit trail is append-only.**
Every non-noop install writes a row to `graph_package_installs` with diff and package contents.

**O19. Noop and rejected installs are observable.**
Both emit distinct domain events (`graph.package_install_noop`, `graph.package_install_rejected`).

**O20. Ownership conflict prevents cross-package record type mutation.**
A package cannot modify record type fields owned by another package (`PACKAGE_OWNERSHIP_CONFLICT`) unless `allowForeignTypeMutation` is set.

**O21. Batch install follows dependency order.**
`installGraphPackages` topologically sorts packages by `dependsOn` and installs sequentially.

**O22. Built-in packages are auditable like custom packages.**
Built-in packages flow through the same install engine — same validation, diff, checksum, version guard, and audit trail.

**O23. Bindings are projected onto snapshot before validation.**
Package `slaPolicies`, `assignmentRules`, and `workflows` are projected as `SLABinding`, `AssignmentBinding`, and `WorkflowBinding` entries in the `GraphSnapshot`. The existing `validateBindingTargetsExist` validator catches bindings to non-existent record types at preview time.

**O24. Binding ownership is enforced.**
A package cannot set SLA/assignment config or create workflows for record types owned by another package (`PACKAGE_BINDING_OWNERSHIP_CONFLICT`) unless `allowForeignTypeMutation` is set.

**O25. Workflow deduplication prevents duplicates.**
During install, if a workflow definition with the same name already exists for the tenant, it is skipped rather than duplicated.

**O26. Environment state ledger is additive.**
Every environment-scoped install writes a row to `environment_package_installs`. The ledger is append-only — environment state is derived by selecting the latest row per `packageKey` per `environmentId`.

**O27. Promotion is deterministic via checksum diff.**
`diffEnvironments` compares the latest checksum per packageKey between two environments. A package is "missing" if the target has no record, "outdated" if checksums differ, and "same" if checksums match. No heuristics.

**O28. Promotion is auditable via source attribution.**
Every environment install records `source: "install" | "promote"`. Promotion uses `source="promote"` so the audit trail distinguishes direct installs from promotions.

**O29. Downgrade promotion is rejected by version guard.**
When promoting a package, the standard semver version guard applies. If the target environment already has a higher version, promotion is rejected unless `allowDowngrade` is set.

**O30. Promotion intents follow a deterministic state machine.**
Valid transitions: draft→previewed, draft→rejected, previewed→previewed (re-preview), previewed→approved, previewed→rejected, approved→executed, approved→rejected. `executed` and `rejected` are terminal. Invalid transitions throw `PromotionIntentError`.

**O31. `requiresPromotionApproval` blocks direct promotion.**
When a target environment has `requiresPromotionApproval=true`, the direct `POST /api/admin/environments/promote` endpoint returns 403. Callers must use the promotion intent workflow instead.

**O32. Approval requires a human actor.**
The `POST .../promotions/:id/approve` endpoint uses `assertNotAgent` to block agent actors from approving promotion intents. This ensures human oversight for production-bound promotions.

**O33. Execution requires approved status.**
`executePromotionIntent` validates the intent is in `approved` status before calling `promoteEnvironmentPackages`. Attempting to execute from any other state throws `PromotionIntentError`.

**O34. All intent transitions emit domain events.**
Every state transition in the promotion intent lifecycle emits a corresponding `graph.promotion_intent_*` domain event for audit and observability.

**O35. Built-in packages are independently installable.**
Each built-in package (hr.lite, itsm.lite) has no `dependsOn` overlap and no shared record type keys. They can be installed into the same project without ownership conflicts, and each flows through the same install engine (validation, diff, checksum, audit trail).

**O36. Ownership isolation between packages.**
Record type keys are owned by the first package that creates them (determined from `graph_package_installs` audit trail). A second package attempting to mutate those types is rejected with `PACKAGE_OWNERSHIP_CONFLICT` unless `allowForeignTypeMutation` is set. ITSM Lite and HR Lite have zero key overlap by design.

**O37. Vibe layer never mutates DB directly.**
`vibeService` generates `GraphPackage` JSON only. All database mutations flow through `installGraphPackage` which provides the full safety model (idempotency, version guard, ownership check, validation, audit trail). The vibe layer is a pure generation/transformation layer.

**O38. Vibe packages flow through full install safety model.**
When `installVibePackage` is called, it delegates to `installGraphPackage` with no special bypass flags. This means vibe-generated packages get the same checksum-based idempotency, semver version guard, ownership conflict detection, graph validation, and audit trail as any other package.

**O39. LLM adapter with validation pipeline.**
`generatePackageFromPrompt` is async and uses an `LlmAdapter` to generate raw JSON, then validates via Zod schema and namespace guards. The stub adapter preserves the original deterministic keyword matching. Templates are deep-cloned via `structuredClone` and never mutated.

**O40. Refinement changes checksum.**
Each `refinePackageFromPrompt` call produces a new `GraphPackage` with a different `computePackageChecksum` value, ensuring the install engine treats it as a new version rather than a noop.

**O41. Draft IDs are server-generated.**
`vibe_package_drafts.id` is a server-generated UUID (`gen_random_uuid()`). Clients never supply draft IDs. This prevents ID guessing and ensures uniqueness without client coordination.

**O42. Drafts are tenant-scoped.**
`getVibeDraft` filters by `tenant_id` via `getTenantStorage(ctx)`. A draft created by tenant A is invisible to tenant B, even if the draft ID is known. Cross-tenant isolation is enforced at the storage layer.

**O43. Installed/discarded drafts are terminal.**
Once a draft reaches `installed` or `discarded` status, no further mutations (refine, preview, install) are allowed. The service layer rejects these with HTTP 409.

**O44. Draft installs delegate to install engine.**
`installDraft` calls `installVibePackage` → `installGraphPackage`. The draft layer never bypasses the standard install safety model (idempotency, version guard, ownership check, graph validation, audit trail).

**O45. Vibe UI uses same tenant headers as all other pages.**
`client/src/pages/vibe-studio.tsx` uses `apiRequest` from `queryClient.ts` which injects `x-tenant-id` and `x-user-id` headers from localStorage. No special auth — same pattern as admin console.

**O46. Install button requires previewed status.**
The "Install to Dev" button in Vibe Studio is disabled unless `draft.status === "previewed"`. This enforces the server invariant (O43) at the UI layer for better UX.

**O47. Terminal drafts show read-only view.**
When a draft is `installed` or `discarded`, the refine/preview/install controls are hidden and a read-only message is shown. Actions cannot be triggered on terminal drafts from the UI.

**O48. LLM output is untrusted — must pass Zod schema validation.**
`generatePackageFromPrompt` validates all LLM adapter output via `graphPackageSchema.parse()` (strict mode — rejects unknown fields). Invalid output throws `VibeServiceError("INVALID_GENERATED_PACKAGE", 422)` with Zod error details. The adapter returns `unknown` intentionally.

**O49. Generated packages must use `vibe.` namespace prefix.**
After Zod validation, the namespace guard requires `packageKey` to start with `"vibe."`. Packages with any other prefix are rejected with `VibeServiceError("INVALID_NAMESPACE")`.

**O50. Reserved namespaces (`hr.`, `itsm.`) blocked at generation time.**
The namespace guard explicitly rejects `packageKey` values starting with `"hr."` or `"itsm."` (defense-in-depth — O49's `vibe.` requirement subsumes this, but both checks are explicit).

**O51. LLM generation observable via telemetry (requested/succeeded/failed).**
When a `TenantContext` is provided, `generatePackageFromPrompt` emits `vibe.llm_generation_requested` before calling the adapter, then either `vibe.llm_generation_succeeded` or `vibe.llm_generation_failed` depending on outcome. All three events are persisted to `execution_telemetry_events`.

**O52. Repair loop is preview-only — never auto-installs.**
`generateAndPreviewWithRepair` generates a package, validates it, optionally retries with error context, and runs the preview pipeline (`previewVibePackage`). It never calls `installGraphPackage` or `installVibePackage`. The caller (route handler or draft service) decides whether to install.

**O53. Non-schema errors are not retried.**
The repair loop only retries on Zod validation failures (`INVALID_GENERATED_PACKAGE`). Namespace guard violations (`INVALID_NAMESPACE`, `RESERVED_NAMESPACE`) and adapter null returns (no match) propagate immediately without consuming retry attempts.

**O54. LLM adapters use native fetch — no SDK dependencies.**
`AnthropicLlmAdapter` and `OpenAiLlmAdapter` use the built-in `fetch` API. No `@anthropic-ai/sdk` or `openai` npm packages are required. Adapter selection is via `VIBE_LLM_PROVIDER` env var or auto-detected from `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` presence.

**O55. LLM output is sanitized via `extractJson()`.**
Before parsing, `extractJson()` handles raw JSON, markdown code fences (` ```json ... ``` `), and embedded `{...}` blocks. This defense-in-depth ensures noisy LLM output is normalized before Zod validation.

**O56. Draft discard is idempotent.**
Calling `discardDraft` on an already-discarded draft returns the draft without a DB write or domain event emission. This prevents duplicate events and wasted writes.

**O57. Repair attempts are observable via telemetry.**
Each repair attempt emits a `vibe.llm_repair_attempted` domain event with the attempt number, error details from the previous attempt, and whether the repair succeeded. This enables monitoring of LLM output quality and repair effectiveness.

**O58. LLM refinement has automatic deterministic fallback.**
`refinePackageFromPrompt` tries LLM adapter refinement first. If the adapter returns null (stub), throws an error (API failure), or returns invalid schema (Zod rejection), the function silently falls back to deterministic pattern matching. This ensures refinement never fails just because the LLM is unavailable.

**O59. LLM refinement output is untrusted — same validation as generation.**
When the adapter returns a refined package, it flows through the same `validateGraphPackage` (Zod strict schema) and namespace guard (`vibe.` required, `hr.`/`itsm.` blocked) as initial generation. Invalid LLM refinement output triggers fallback, not an error to the user.

**O60. LLM refinement is observable via telemetry.**
When a `TenantContext` is provided, `refinePackageFromPrompt` emits `vibe.llm_refinement_requested` before calling the adapter, then either `vibe.llm_refinement_succeeded` or `vibe.llm_refinement_failed` depending on outcome. The failed event is emitted even when fallback succeeds — it tracks LLM quality, not user-facing outcome.

**O61. Streaming preview is preview-only — never auto-installs.**
`generateAndPreviewWithRepairStreaming` emits stage events via a callback but follows the same pipeline as `generateAndPreviewWithRepair`. It NEVER calls `installGraphPackage` or `installVibePackage`. The SSE endpoint closes the connection after the `complete` event.

**O62. Streaming stage events are structured and ordered.**
The SSE stream emits events with `stage` field in pipeline order: `generation` → `validation` → `projection` → `diff` → `complete`. On schema failure with repair: `generation` → `repair` → `validation` → `projection` → `diff` → `complete`. On non-schema error: `generation` → `error`. The `complete` event includes the full `RepairResult`.

**O63. Promotion UI uses same RBAC-protected endpoints as CLI/API.**
The Vibe Studio Promotion panel calls the same `GET /api/admin/environments/:envId/packages`, `GET /api/admin/environments/diff`, and `POST /api/admin/environments/promotions/*` endpoints used by any other client. No special UI-only routes or bypasses.

**O64. Intent buttons follow state machine — only valid transitions shown.**
The Promotion panel renders action buttons based on the intent's current status: Preview (draft/previewed), Approve (previewed), Execute (approved), Reject (any non-terminal). Invalid transitions are not just disabled — they are not rendered. This matches the server-side `VALID_TRANSITIONS` state machine in `promotionIntentService.ts`.

**O65. Environment package state refreshed after execute.**
After a successful promotion intent execution, the UI invalidates both the `promotion-intents` and `env-packages` query caches, ensuring the environment package state tables reflect the newly promoted packages without manual refresh.

**O66. Patch ops are pure — applied to package JSON only, never to platform graph.**
`applyPatchOpsToPackage` is a pure function that operates on `GraphPackage` JSON via `structuredClone`. It never reads from or writes to the database. All DB mutations still flow through the preview → install pipeline.

**O67. Patch ops reset draft status to "draft" (forces re-preview).**
`applyDraftPatchOps` always sets draft status back to `"draft"` after applying ops, same pattern as `refineDraft`. This ensures the user must re-preview before installing, maintaining the safety model.

**O68. Patch ops preserve package schema validity (no empty record types).**
`remove_field` throws `DraftPatchOpError` when removing the last field from a record type. `add_field` and `rename_field` guard against duplicate names. These guards maintain `GraphPackage` structural validity at the patch op layer.

**O69. Patch op edits are observable via `vibe.draft_patched` telemetry.**
Every successful `applyDraftPatchOps` call emits a `vibe.draft_patched` domain event with `opCount` in `affectedRecords`. This enables monitoring of inline editing activity alongside LLM-based refinement.

**O70. Draft versions are additive-only — never deleted, forming an immutable audit trail.**
The `vibe_package_draft_versions` table stores snapshots of draft state at each mutation point (create, refine, patch, restore). Versions are never deleted or modified — restoring creates a new version with reason "restore" rather than truncating history.

**O71. Restoring a draft version resets status to "draft" (forces re-preview).**
Same safety model as patch and refine: any package mutation invalidates the preview and requires re-preview before install. Restore also creates a new version snapshot to track the restore action.

**O72. Version numbering is monotonically increasing per draft.**
Each draft maintains its own version counter derived from `MAX(version_number)` in the versions table. The unique constraint on `(tenant_id, draft_id, version_number)` prevents concurrent duplicates.

**O73. Version creation and restoration are observable via telemetry.**
Every version snapshot emits `vibe.draft_version_created` with version number, reason, and checksum. Every restore emits `vibe.draft_restored` with the restored version number.

**O74. Multi-variant generation is exploration-only — never creates drafts or mutates graph.**
`generateVariantsWithPreview` generates N validated packages, projects them onto the graph snapshot, and returns diff + validation errors. It NEVER creates `vibe_package_drafts` rows, calls `installGraphPackage`, or writes to any table. Variants are ephemeral results.

**O75. `createDraftFromVariant` bypasses LLM — uses pre-validated package directly.**
`createDraftFromVariant` takes a `GraphPackage` that was already validated during variant generation. It creates a draft and version snapshot without calling the LLM adapter, `generatePackageFromPrompt`, or `generateAndPreviewWithRepair`. The package is used as-is.

**O76. Variant count is bounded (1–5).**
`generateVariantsWithPreview` throws `MultiVariantError` for count < 1 or count > 5. The route handler also validates this before calling the service.

**O77. Variant generation is observable via telemetry (requested/completed).**
`generateVariantsWithPreview` emits `vibe.variant_generation_requested` before generating and `vibe.variant_generation_completed` after, with counts of requested, generated, and excluded variants.

**O78. Invalid variants are excluded with telemetry — not propagated as errors.**
Variants that fail Zod validation, namespace guard, or adapter errors are silently excluded from the result array. The `excluded` count in the `vibe.variant_generation_completed` event tracks how many were dropped. This ensures partial LLM failures don't block the entire operation.

**O79. Variant diff is pure comparison — no side effects beyond telemetry.**
`diffPackages` projects both packages onto the tenant's graph snapshot and diffs the projections. It never creates drafts, writes to tables, or modifies the graph. The only side effect is a `vibe.variant_diff_computed` domain event.

**O80. Adopt-variant resets draft status to "draft" — forces re-preview.**
`adoptVariant` replaces the draft's package and checksum, then sets `status = "draft"` and clears `lastPreviewDiff` / `lastPreviewErrors`. This forces users to re-preview before installing, ensuring the new package is validated against the current graph.

**O81. Adopt-variant creates a version snapshot with reason "adopt_variant".**
Every `adoptVariant` call creates a new `vibe_draft_versions` row with `reason = "adopt_variant"` and a monotonically increasing version number. This makes adoption auditable and reversible via `restoreDraftVersion`.

**O82. Variant diff is observable via `vibe.variant_diff_computed` telemetry.**
`diffPackages` emits a `vibe.variant_diff_computed` domain event containing both package keys and summary counts (added/removed/modified record types).

**O83. Adopt-variant is observable via `vibe.draft_variant_adopted` telemetry.**
`adoptVariant` emits a `vibe.draft_variant_adopted` domain event containing the draft ID, new package key, new checksum, and previous checksum.

**O84. Streamed tokens are display-only — untrusted until validated.**
Token events emitted during `generateAndPreviewWithTokenStreaming` are for UI rendering only. The actual package is extracted from the accumulated buffer via `extractJson`, then validated through the full Zod + namespace guard pipeline before producing a result. No package data from token events is used for any server-side logic.

**O85. Token streaming preserves the full validation pipeline.**
`generateAndPreviewWithTokenStreaming` runs the same extract → validate → namespace guard → project → validate → diff pipeline as `generateAndPreviewWithRepair`. The only difference is that tokens are streamed to the client as they arrive. Schema validation, namespace checks, and graph projection remain mandatory.

**O86. Token streaming is preview-only — no install or draft creation.**
`generateAndPreviewWithTokenStreaming` and `generateMultiWithTokenStreaming` NEVER call `installGraphPackage`, create `vibe_package_drafts` rows, or write to any table except execution telemetry. Results are ephemeral — the client must explicitly create a draft after reviewing the streamed output.

**O87. Token streaming is observable via telemetry (started/completed/failed).**
`generateAndPreviewWithTokenStreaming` emits `vibe.llm_token_stream_started` before streaming, `vibe.llm_token_stream_completed` after successful completion (with package key, checksum, attempt count), and `vibe.llm_token_stream_failed` on unrecoverable errors.

**O88. Streaming multi-variant generation is capped at 3 variants.**
`generateMultiWithTokenStreaming` enforces a maximum of 3 variants (vs 5 for non-streaming). This prevents long-running SSE connections. Variants are generated sequentially (not parallel) to enable per-variant token streaming.

**O89. Draft version diff is read-only — no status gating, no graph mutation.**
`diffDraftVersions` works on any draft status (draft, previewed, installed, discarded). It never modifies the draft, creates versions, or writes to any table except execution telemetry. This allows historical comparison on terminal drafts.

**O90. Draft version diff uses shared snapshot projection for accurate comparison.**
Both version packages are projected onto the same `GraphSnapshot` (built from the current tenant graph) before diffing. This ensures the diff reflects structural differences between versions relative to the current platform state, not just raw JSON differences.

**O91. Draft version diff is observable via `vibe.draft_version_diff_computed` telemetry.**
Every successful `diffDraftVersions` call emits a `vibe.draft_version_diff_computed` domain event with `draftId`, `fromVersion`, `toVersion`, and summary counts (added/removed/modified record types).

**O92. Notifications are best-effort — never block the promotion lifecycle.**
`sendWebhook` catches all errors (network, timeout, non-2xx) and returns a structured `{ success, error }` result. A failed webhook does not prevent preview, approval, or execution. The promotion intent status is always set before the notification attempt.

**O93. Notification delivery is tracked on the promotion intent.**
After a webhook attempt during preview, the intent is updated with `notificationStatus` ("sent" | "failed" | "pending"), `notificationLastError` (error string or null), and `notificationLastAttemptAt` (timestamp). This enables UI display and operational debugging.

**O94. Notification delivery is observable via telemetry.**
Every webhook attempt emits either `graph.promotion_notification_sent` or `graph.promotion_notification_failed` as a domain event. This feeds into the execution telemetry table for audit and monitoring dashboards.

**O95. Webhooks fire only when both environment conditions are met.**
Preview notifications require BOTH `requiresPromotionApproval=true` AND `promotionWebhookUrl` configured on the target environment. Execute notifications require only `promotionWebhookUrl` (all executions are notable regardless of approval gating).
