# EC3L Architecture Ledger

This file tracks structural changes to the EC3L platform. It serves as a single source of truth for what changed, when, and why.

**Maintained by:** Claude (automated on each phase completion)
**Format:** Append to the changelog. Overwrite the "Latest Change" section.

---

## Changelog

### Phase 5 — Graph Contract Formalization
- **Date:** 2026-02-20
- **Files:** `server/graph/graphContracts.ts`, `server/graph/graphRegistryService.ts`, `server/graph/graphValidationService.ts`, `server/graph/mergeGraphValidator.ts`, `server/executors/patchOpExecutor.ts`, `server/__tests__/graphValidation.test.ts`, `ai-context/08-operational-subsystems.md`
- **Summary:** Introduced the `server/graph/` directory with pure contract types, a tenant-scoped snapshot builder, four pure validators (orphan, cycle, duplicate field, binding target), and a merge-time bridge (`validateGraphForMerge`) wired into patchOpExecutor Phase 1.5. Added `graph.validation_failed` domain event. No new DB tables.
- **Invariants:** O7 (graph validation before mutation), O8 (pure validators), O9 (project-scoped)

### Phase 5.1 — Graph Stabilization & Observability
- **Date:** 2026-02-20
- **Files:** `server/graph/graphContracts.ts`, `server/graph/graphValidationService.ts`, `server/graph/mergeGraphValidator.ts`, `server/graph/graphService.ts` (new), `server/executors/patchOpExecutor.ts`, `server/services/domainEventService.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `server/__tests__/graphValidation.test.ts`, `ai-context/08-operational-subsystems.md`
- **Summary:** Enriched `GraphValidationError` with `recordTypeId`, `baseTypeKey`, `details`. Added `validateBaseTypeSameProject` validator (`BASE_TYPE_CROSS_PROJECT`). Merge validator now loads all tenant record types for cross-project detection. Created `graphService.ts` for admin introspection. Added two RBAC-protected admin endpoints (`GET /api/admin/graph/snapshot`, `GET /api/admin/graph/validate`). Added `graph.validation_succeeded` domain event. 310 tests passing.
- **Invariants:** O9 rewritten (baseType same-project enforcement), O10 added (validation success observable)

### Phase 5.2 — Graph Diff & Preview Foundation
- **Date:** 2026-02-20
- **Files:** `server/graph/graphDiffService.ts` (new), `server/graph/mergeGraphValidator.ts`, `server/graph/graphService.ts`, `server/executors/patchOpExecutor.ts`, `server/services/domainEventService.ts`, `server/routes.ts`, `server/__tests__/graphValidation.test.ts`
- **Summary:** Introduced deterministic graph diff capability (`diffGraphSnapshots`) comparing two `GraphSnapshot` objects. Refactored `mergeGraphValidator` to expose `buildProjectedSnapshot` returning both current and projected snapshots. Integrated diff into patchOpExecutor Phase 1.5 — computes diff after successful validation and emits `graph.diff_computed` domain event. Added `getChangeDiff` to `graphService` and RBAC-protected admin endpoint `GET /api/admin/graph/diff?projectId=...&changeId=...`. 318 tests passing.
- **Invariants:** O11 (graph diff computed at merge time), O12 (diff observable via domain event)

### Phase 6 — Installable Graph System (Core Engine Only)
- **Date:** 2026-02-20
- **Files:** `server/graph/installGraphService.ts` (new), `server/graph/graphService.ts`, `server/services/domainEventService.ts`, `server/routes.ts`, `server/__tests__/graphInstall.test.ts` (new)
- **Summary:** Introduced a graph package install engine that safely applies metadata templates (record types + fields) into a tenant/project. The engine builds a projected snapshot by merging the package onto the current full-tenant graph, validates it via all existing validators (orphan, cycle, duplicate, cross-project), computes a diff, and optionally applies mutations in topological order (base types first). Supports preview mode (`previewOnly: true`) for dry-run diff + validation without mutations. New record types created via `recordTypeService.createRecordType` (defense in depth); existing types get fields merged via `updateRecordTypeSchema`. Added RBAC-protected admin endpoint `POST /api/admin/graph/install?projectId=...&preview=true|false`. Added `graph.package_installed` domain event. 332 tests passing across 29 test files.
- **Invariants:** O13 (graph validation before install mutation), O14 (topological ordering of install), O15 (install observable via domain event)

### Phase 7 — Graph Package Versioning + Install Audit Trail
- **Date:** 2026-02-20
- **Files:** `server/graph/installGraphService.ts`, `server/graph/graphService.ts`, `server/services/domainEventService.ts`, `server/routes.ts`, `server/storage.ts`, `server/tenantStorage.ts`, `shared/schema.ts`, `migrations/0008_graph_package_installs.sql` (new), `server/__tests__/graphInstall.test.ts`
- **Summary:** Extended the graph package install engine with package identity (`packageKey`, `version`), deterministic SHA-256 checksum computation, idempotency (checksum match → noop), semver-based version guard (downgrade rejection unless `allowDowngrade`), and an append-only audit trail (`graph_package_installs` table). Added admin endpoints for install history (`GET /api/admin/graph/packages`) and version diff (`GET /api/admin/graph/packages/diff`). Added `graph.package_install_noop` and `graph.package_install_rejected` domain events. 341 tests passing across 29 test files.
- **Invariants:** O16 (idempotent install via checksum), O17 (version guard prevents downgrade), O18 (install audit trail append-only), O19 (noop/rejected observable via domain events)

### Phase 8 — Built-in Package + Minimal Dependency Semantics
- **Date:** 2026-02-20
- **Files:** `server/graph/packages/hrLite.ts` (new), `server/graph/installGraphService.ts`, `server/graph/graphService.ts`, `server/routes.ts`, `server/__tests__/graphInstall.test.ts`
- **Summary:** Introduced built-in graph packages with the HR Lite package (`hr.lite` v0.1.0, 4 record types: person, employee→person, department, hr_case). Extended `GraphPackage` with optional `dependsOn` for inter-package dependency semantics. Added `installGraphPackages` batch orchestrator that topologically sorts packages by `dependsOn` and stops on first failure. Added `PACKAGE_OWNERSHIP_CONFLICT` validation: packages cannot mutate record types owned by another package (determined from audit trail) unless `allowForeignTypeMutation` is set. Added built-in package registry with admin endpoints `GET /api/admin/graph/built-in` and `POST /api/admin/graph/install-built-in`. 353 tests passing across 29 test files.
- **Invariants:** O20 (ownership conflict prevents cross-package mutation), O21 (dependency-ordered batch install), O22 (built-in packages versioned and auditable like custom packages)

### Phase 9 — Binding Support in GraphPackage
- **Date:** 2026-02-20
- **Files:** `server/graph/installGraphService.ts`, `server/graph/graphService.ts`, `server/graph/packages/hrLite.ts`, `server/tenantStorage.ts`, `server/__tests__/graphInstall.test.ts`
- **Summary:** Extended `GraphPackage` with optional `slaPolicies`, `assignmentRules`, and `workflows` sections. Bindings follow the same lifecycle as record types: pure projection onto `GraphSnapshot` → graph validation → diff computation → apply mutations. The projection injects `SLABinding`, `AssignmentBinding`, and `WorkflowBinding` entries with synthetic IDs so preview/diff works before any DB writes. Apply phase sets `slaConfig`/`assignmentConfig` JSONB on record types and creates workflow definitions + triggers + steps. Ownership check extended to binding targets via `PACKAGE_BINDING_OWNERSHIP_CONFLICT`. Checksum includes bindings (backward compatible for packages without bindings). HR Lite upgraded to v0.2.0 with SLA (1440 min on hr_case), assignment (static_group hr_ops on hr_case), and workflow (HR Case Triage with assignment+notification steps). 371 tests passing across 29 test files (53 in graphInstall.test.ts, up from 35).
- **Invariants:** O23 (bindings projected before validation), O24 (binding ownership enforced), O25 (workflow deduplication by name)

### Phase 10 — Promotion-Safe Package Promotion
- **Date:** 2026-02-20
- **Files:** `shared/schema.ts`, `migrations/0009_environment_package_installs.sql` (new), `server/tenantStorage.ts`, `server/graph/installGraphService.ts`, `server/graph/promotionService.ts` (new), `server/graph/graphService.ts`, `server/routes.ts`, `server/services/domainEventService.ts`, `server/__tests__/graphPromotion.test.ts` (new)
- **Summary:** Introduced environment-scoped package state tracking and safe promotion (dev → staging → prod). New `environment_package_installs` table records what packages are installed per environment with source attribution ("install" or "promote"). Install path extended with optional `environmentId` — writes to both the global audit ledger and the environment state ledger. New `promotionService.ts` computes environment diffs (missing/outdated/same), promotes packages in dependency order with rollback-on-failure semantics, and emits `graph.package_promoted` domain events. Three new admin endpoints for environment package state, cross-environment diff, and promotion. 384 tests passing across 30 test files (13 in graphPromotion.test.ts).
- **Invariants:** O26 (environment state ledger additive), O27 (promotion deterministic via checksum diff), O28 (promotion auditable via source="promote"), O29 (downgrade promotion rejected by version guard)

### Phase 11 — Promotion Governance & Environment Gates
- **Date:** 2026-02-20
- **Files:** `shared/schema.ts`, `migrations/0010_promotion_intents.sql` (new), `server/tenantStorage.ts`, `server/services/rbacService.ts`, `server/services/domainEventService.ts`, `server/graph/promotionIntentService.ts` (new), `server/graph/graphService.ts`, `server/routes.ts`, `server/__tests__/promotionIntent.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Introduced `PromotionIntent` — a governed, reviewable lifecycle for environment promotions (draft → previewed → approved → executed). Environments gain a `requiresPromotionApproval` gate flag that blocks direct promotion when enabled. New `ENVIRONMENT_PROMOTE` RBAC permission controls approval and execution. Approval requires a human actor (agent guard). Five new domain events track intent lifecycle transitions. 403 tests passing across 31 test files (19 new in promotionIntent.test.ts).
- **Invariants:** O30 (deterministic state machine), O31 (environment gate blocks direct promotion), O32 (approval requires human actor), O33 (execution requires approved status), O34 (all transitions emit domain events)

### Phase 12 — ITSM Lite Built-in Package + Promotion Lifecycle Proof
- **Date:** 2026-02-20
- **Files:** `server/graph/packages/itsmLite.ts` (new), `server/graph/graphService.ts`, `server/__tests__/itsmLifecycle.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Introduced ITSM Lite (`itsm.lite` v0.1.0) — the second built-in graph package with 4 record types (cmdb_ci, incident, problem, itsm_change), SLA/assignment/workflow bindings for incident. End-to-end lifecycle tests prove the full install → PromotionIntent → promote → gate enforcement flow across DEV → STAGING → PROD environments. No new DB tables. 422 tests passing across 32 test files (19 new in itsmLifecycle.test.ts).
- **Invariants:** O35 (built-in packages are independently installable), O36 (ownership isolation between packages)

### Phase 13 — Vibe Authoring Layer (Generate → Preview → Install)
- **Date:** 2026-02-20
- **Files:** `server/vibe/vibeTemplates.ts` (new), `server/vibe/vibeService.ts` (new), `server/services/domainEventService.ts`, `shared/schema.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `server/__tests__/vibe.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Introduced the Vibe Authoring Layer — a "describe an app" API that generates previewable `GraphPackage` JSON from natural-language prompts via deterministic keyword-matched starter templates (LLM swap planned later). Four templates: onboarding, PTO request, vendor intake, simple ticketing. Two new endpoints (`POST /api/vibe/preview`, `POST /api/vibe/install`). Vibe layer never directly mutates DB — all installs delegate to `installGraphPackage`. Supports refinement loop (add field, rename, add SLA). Two new domain events. 480 tests passing across 33 test files (34 new in vibe.test.ts).
- **Invariants:** O37 (vibe never mutates DB directly), O38 (vibe packages flow through full install safety model), O39 (deterministic template matching), O40 (refinement changes checksum)

### Phase 14 — Vibe Draft Persistence + Preview Lifecycle
- **Date:** 2026-02-20
- **Files:** `shared/schema.ts`, `migrations/0011_vibe_package_drafts.sql` (new), `server/tenantStorage.ts`, `server/vibe/vibeDraftService.ts` (new), `server/services/domainEventService.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `server/__tests__/vibeDraft.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Added server-side draft persistence so clients can iterate on vibe packages without sending full package JSON each time. New `vibe_package_drafts` table with server-generated UUIDs, status lifecycle (draft → previewed → installed/discarded), and stored preview diffs. Draft service provides create/refine/preview/install lifecycle. Five new endpoints under `/api/vibe/drafts`. Four new domain events. Installs still delegate to `installGraphPackage`. 503 tests passing across 34 test files (23 new in vibeDraft.test.ts).
- **Invariants:** O41 (draft IDs are server-generated), O42 (drafts are tenant-scoped), O43 (installed/discarded drafts are terminal), O44 (draft installs delegate to install engine)

### Phase 15 — Vibe UI Panel (Admin-only)
- **Date:** 2026-02-20
- **Files:** `client/src/lib/api/vibe.ts` (new), `client/src/lib/api/promotion.ts` (new), `client/src/pages/vibe-studio.tsx` (new), `client/src/App.tsx`, `client/src/components/app-sidebar.tsx`, `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Introduced "Vibe Studio" — the first dedicated UI for vibe authoring. Two-pane layout: left panel (draft list with status badges, create prompt, app name input) and right panel (package detail, refine input, preview/install actions, diff viewer with color-coded sections, validation errors panel, package contents table). Admin-only via RBAC check. Uses existing `/api/vibe/drafts` endpoints via typed API helpers. Sidebar entry with Sparkles icon. Route at `/vibe-studio`. No server changes.
- **Invariants:** O45 (vibe UI uses same tenant headers as all other pages), O46 (install button requires previewed status), O47 (terminal drafts show read-only view)

### Phase 16 — LLM-Powered Package Generation
- **Date:** 2026-02-20
- **Files:** `server/vibe/graphPackageSchema.ts` (new), `server/vibe/llmAdapter.ts` (new), `server/vibe/vibeService.ts`, `server/vibe/vibeDraftService.ts`, `server/services/domainEventService.ts`, `shared/schema.ts`, `server/routes.ts`, `server/__tests__/vibeLlm.test.ts` (new), `server/__tests__/vibe.test.ts`, `server/__tests__/vibeDraft.test.ts`, `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Replaced the synchronous `generatePackageFromPrompt` with an async LLM adapter pipeline. All LLM output is treated as untrusted input: raw JSON flows through Zod strict schema validation (`graphPackageSchema`) then namespace safety guards (`vibe.` required, `hr.`/`itsm.` blocked). Introduced `LlmAdapter` interface with a `StubLlmAdapter` that preserves the existing keyword-matching behavior for backward compatibility. Three new domain events track generation lifecycle (`vibe.llm_generation_requested/succeeded/failed`). 520 tests passing across 35 test files (17 new in vibeLlm.test.ts).
- **Invariants:** O39 rewritten (LLM adapter with validation pipeline), O48 (LLM output untrusted — Zod validation), O49 (vibe. namespace required), O50 (reserved namespaces blocked), O51 (generation observable via telemetry)

### Phase 17 — Real LLM Adapter + Preview Repair Loop + Draft Discard
- **Date:** 2026-02-20
- **Files:** `server/vibe/llmAdapter.ts`, `server/vibe/promptBuilder.ts` (new), `server/vibe/repairService.ts` (new), `server/vibe/vibeDraftService.ts`, `server/services/domainEventService.ts`, `shared/schema.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/vibeRepair.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Extended the LLM adapter layer with real Anthropic and OpenAI adapters (native `fetch`, no SDK dependencies), selected via `VIBE_LLM_PROVIDER` env var or auto-detected from API keys. Added a structured prompt builder for JSON-only LLM output. Introduced a preview repair loop (`generateAndPreviewWithRepair`) that generates a package, validates via Zod, optionally retries with error context fed back to the LLM, and runs the preview pipeline — never auto-installs. Added draft discard lifecycle (`discardDraft`) allowing any non-installed draft to be discarded (terminal state, idempotent). Added Discard button to Vibe Studio UI. Two new domain events (`vibe.llm_repair_attempted`, `vibe.draft_discarded`). 539 tests passing across 36 test files (19 new in vibeRepair.test.ts).
- **Invariants:** O52-O57 added

### Phase 18 — LLM-Powered Refinement + Streaming Preview
- **Date:** 2026-02-20
- **Files:** `server/vibe/vibeService.ts`, `server/vibe/llmAdapter.ts`, `server/vibe/promptBuilder.ts`, `server/vibe/repairService.ts`, `server/vibe/vibeDraftService.ts`, `server/services/domainEventService.ts`, `shared/schema.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/vibeRepair.test.ts`, `server/__tests__/vibe.test.ts`, `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Made `refinePackageFromPrompt` async with optional LLM path: tries LLM adapter refinement first (with Zod validation + namespace guard), falls back to deterministic pattern matching on failure. Added `refineGraphPackage` to `LlmAdapter` interface (Anthropic/OpenAI use refinement prompt, stub returns null). Added `buildRefinementPrompt` to prompt builder. Introduced SSE streaming preview endpoint (`POST /api/vibe/preview/stream`) that emits structured stage events (generation → validation → repair → projection → diff → complete) during the repair loop. Updated Vibe Studio UI with streaming status indicator, auto-preview after refine. Three new domain events (`vibe.llm_refinement_requested/succeeded/failed`). 551 tests passing across 36 test files (12 new in vibeRepair.test.ts, existing refine tests updated to async).
- **Invariants:** O58-O62 added

### Phase 19 — Promotion UI Integration in Vibe Studio
- **Date:** 2026-02-20
- **Files:** `server/graph/promotionIntentService.ts`, `server/graph/graphService.ts`, `server/routes.ts`, `client/src/lib/api/promotion.ts`, `client/src/pages/vibe-studio.tsx`, `ai-context/EC3L_ARCHITECTURE_LEDGER.md`
- **Summary:** Added Promotion UI tab inside Vibe Studio. New "Promotion" tab alongside existing "Drafts" tab provides full environment promotion lifecycle from within the admin UI. Environment selectors (from/to) with package state tables, compute-drift button calling the diff endpoint, and the full promotion intent workflow (Create → Preview → Approve → Execute/Reject). Added `listPromotionIntents` to the service layer and a `GET /api/admin/environments/promotions` route. Extended client API helpers with `listEnvironmentPackages`, `diffEnvironments`, and `listPromotionIntents`. Approve/Execute buttons only shown in appropriate states (previewed/approved). Terminal intents (executed/rejected) show read-only view. 551 tests passing across 36 test files (no new server tests — UI-only changes with existing endpoint coverage).
- **Invariants:** O63 (promotion UI uses same RBAC-protected endpoints as CLI/API), O64 (intent buttons follow state machine — only valid transitions shown), O65 (environment package state refreshed after execute)

### Phase 20 — Inline Diff Editing (Draft Patch Ops + UI Controls)
- **Date:** 2026-02-20
- **Files:** `server/vibe/draftPatchOps.ts` (new), `server/vibe/vibeDraftService.ts`, `server/services/domainEventService.ts`, `shared/schema.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/draftPatchOps.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Added structured, surgical edits to draft packages via typed patch operations. New pure `applyPatchOpsToPackage` engine supports 5 op types: add_field, rename_field, remove_field, set_sla, set_assignment_group. All ops are applied to the in-memory `GraphPackage` JSON stored on the draft — the preview → install pipeline remains the only path to DB mutations. New `POST /api/vibe/drafts/:draftId/patch` endpoint. Vibe Studio UI gains an inline edit form (operation selector, record type selector, dynamic fields per op type, apply button with auto-preview). New `vibe.draft_patched` domain event. ~18 new tests covering pure ops and service integration.
- **Invariants:** O66 (patch ops pure), O67 (patch resets to draft), O68 (schema validity preserved), O69 (patch observable via telemetry)

### Phase 21 — Draft Versioning + Undo/Redo (History + Restore)
- **Date:** 2026-02-21
- **Files:** `migrations/0012_vibe_package_draft_versions.sql` (new), `shared/schema.ts`, `server/tenantStorage.ts`, `server/services/domainEventService.ts`, `server/vibe/vibeDraftService.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/draftVersioning.test.ts` (new), `server/__tests__/vibeDraft.test.ts`, `server/__tests__/draftPatchOps.test.ts`, `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Added version history system for vibe package drafts. New additive `vibe_package_draft_versions` table stores immutable snapshots of draft state at each mutation point (create, refine, patch, restore). Monotonic version numbering per draft. Version snapshots auto-created on every draft mutation (createDraftFromPrompt, refineDraft, applyDraftPatchOps). New `restoreDraftVersion` method restores a draft to a previous version's package/checksum/preview state, resets status to "draft", and creates a new version snapshot with reason "restore". Two new domain events: `vibe.draft_version_created` and `vibe.draft_restored`. Two new routes: `GET /api/vibe/drafts/:draftId/versions` and `POST /api/vibe/drafts/:draftId/restore`. Vibe Studio UI gains a Version History panel showing v#, reason, timestamp, checksum prefix, and Restore button per version (hidden for current checksum and terminal drafts). 15 new tests, 588 total passing.
- **Invariants:** O70 (versions additive-only), O71 (restore resets to draft), O72 (monotonic version numbering), O73 (version events observable via telemetry)

### Phase 22 — Multi-Variant AI Generation (Compare → Select → Draft)
- **Date:** 2026-02-21
- **Files:** `server/vibe/multiVariantService.ts` (new), `server/vibe/vibeDraftService.ts`, `server/services/domainEventService.ts`, `shared/schema.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/multiVariant.test.ts` (new)
- **Summary:** Added multi-variant AI generation — users can generate N (1–5) variant packages from a single prompt, compare them side-by-side, and select one to create a draft. New `multiVariantService.ts` calls the LLM adapter N times in parallel via `Promise.allSettled`, validates each via Zod schema + namespace guard, projects valid packages onto the current graph snapshot, and returns diff + validation errors + checksum per variant. Invalid variants are excluded with telemetry. New `createDraftFromVariant` in vibeDraftService takes a pre-generated package directly (no LLM call) and creates a draft with version 1 reason="create_variant". Two new routes: `POST /api/vibe/generate-multi` and `POST /api/vibe/drafts/from-variant`. Three new domain events. Vibe Studio UI gains a "Compare" button, Variant Compare Panel showing record types/fields/workflows/SLA/diff per variant, and Select button per variant. Variants NEVER mutate drafts or graph — exploration-only until selected. 601 tests passing across 39 test files (13 new in multiVariant.test.ts).
- **Invariants:** O74 (variants exploration-only), O75 (createDraftFromVariant bypasses LLM), O76 (variant count bounded), O77 (variant generation observable via telemetry), O78 (invalid variants excluded with telemetry)

### Phase 23 — Variant-to-Variant Diff + Adopt Variant Into Existing Draft
- **Date:** 2026-02-21
- **Files:** `server/vibe/variantDiffService.ts` (new), `server/vibe/vibeDraftService.ts`, `server/services/domainEventService.ts`, `shared/schema.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/variantDiff.test.ts` (new)
- **Summary:** Added variant-to-variant diffing and adopt-variant-into-draft capabilities. New `variantDiffService.ts` provides `diffPackages` which projects two packages onto a shared graph snapshot and diffs the projections (showing what changed between packages, not vs current graph). New `adoptVariant` in vibeDraftService replaces an existing draft's package with a variant package — resets status to "draft", clears preview state, creates version with reason "adopt_variant". Two new routes: `POST /api/vibe/variants/diff` and `POST /api/vibe/drafts/:draftId/adopt-variant`. Two new domain events. Vibe Studio UI gains variant comparison controls (pick two variants via dropdowns, diff button, inline diff viewer) and "Adopt" button per variant card (only shown when a non-terminal draft is selected). 616 tests passing across 40 test files (15 new in variantDiff.test.ts).
- **Invariants:** O79 (variant diff is pure comparison), O80 (adopt resets to draft), O81 (adopt creates version snapshot), O82 (variant diff observable via telemetry), O83 (adopt observable via telemetry)

### Phase 24 — Token-Level LLM Streaming (Generation + Repair + Refinement)
- **Date:** 2026-02-21
- **Files:** `server/vibe/llmAdapter.ts`, `server/vibe/tokenStreamService.ts` (new), `server/services/domainEventService.ts`, `shared/schema.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/tokenStream.test.ts` (new)
- **Summary:** Added token-level LLM streaming for vibe generation. Extended `LlmAdapter` interface with `streamGenerate` and `streamRefine` AsyncGenerator methods — Stub adapter streams fake tokens from template JSON, Anthropic/OpenAI adapters stream via SSE with `stream: true`. New `tokenStreamService.ts` provides `generateAndPreviewWithTokenStreaming` which streams tokens from the model, accumulates a buffer, extracts JSON via `extractJson`, validates via Zod + namespace guard, runs repair loop if needed, then projects/validates/diffs — emitting SSE events (token/stage/complete/error) throughout. New `generateMultiWithTokenStreaming` generates up to 3 variants sequentially with per-variant token streaming. Two new SSE routes: `POST /api/vibe/preview/stream-tokens` and `POST /api/vibe/generate-multi/stream`. Three new telemetry events. Client gains `streamPreviewTokens` and `streamMultiTokens` helpers, "Stream tokens" toggle, and a Generation Output panel showing live token text (monospace, blinking cursor), stage indicators, and final diff viewer. Tokens are display-only — the package is extracted from the accumulated buffer and validated before use. No auto-install or auto-draft creation. 630 tests passing across 41 test files (14 new in tokenStream.test.ts).
- **Invariants:** O84 (streamed tokens are display-only), O85 (full validation pipeline preserved), O86 (no install/draft during streaming), O87 (streaming observable via telemetry), O88 (streaming multi-variant capped at 3)

### Phase 25 — Draft Version-to-Version Diff (History Compare)
- **Date:** 2026-02-21
- **Files:** `server/vibe/draftVersionDiffService.ts` (new), `server/services/domainEventService.ts`, `shared/schema.ts`, `server/ec3l/index.ts`, `server/routes.ts`, `client/src/lib/api/vibe.ts`, `client/src/pages/vibe-studio.tsx`, `server/__tests__/draftVersionDiff.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Added version-to-version diffing for draft history. New `draftVersionDiffService.ts` provides `diffDraftVersions(ctx, draftId, fromVersion, toVersion)` which loads both version snapshots, builds a shared graph snapshot, projects both packages, and diffs the projections via `diffGraphSnapshots`. Read-only — works on installed/discarded drafts (no status gating). New route `POST /api/vibe/drafts/:draftId/versions/diff` with RBAC (ADMIN_VIEW). New `vibe.draft_version_diff_computed` domain event. Client API helper `diffDraftVersions`. Vibe Studio Version History panel gains two-version selection dropdowns, Compare button, and inline DiffViewer for results. 640 tests passing across 42 test files (10 new in draftVersionDiff.test.ts).
- **Invariants:** O89 (version diff is read-only), O90 (version diff uses shared snapshot projection), O91 (version diff observable via telemetry)

### Phase 26 — Promotion Approval Notifications (Webhook-first)
- **Date:** 2026-02-21
- **Files:** `shared/schema.ts`, `migrations/0013_promotion_notifications.sql` (new), `server/services/notificationService.ts` (new), `server/services/domainEventService.ts`, `server/tenantStorage.ts`, `server/graph/promotionIntentService.ts`, `server/ec3l/index.ts`, `server/__tests__/promotionNotification.test.ts` (new), `ai-context/EC3L_ARCHITECTURE_LEDGER.md`, `ai-context/08-operational-subsystems.md`
- **Summary:** Added webhook-based push notifications for promotion approval lifecycle. Environments gain an optional `promotionWebhookUrl` column. When a promotion intent is previewed on an environment with `requiresPromotionApproval=true` and a webhook URL configured, a Slack-compatible JSON payload is POSTed to the URL. When a promotion intent is executed and the target environment has a webhook URL, an execution-complete payload is sent. All notifications are best-effort — `sendWebhook` never throws, failures are tracked on the intent (`notificationStatus`, `notificationLastError`, `notificationLastAttemptAt`), and two new telemetry events provide observability. 656 tests passing across 43 test files (16 new in promotionNotification.test.ts).
- **Invariants:** O92 (notifications best-effort), O93 (notification delivery tracked on intent), O94 (notification delivery observable via telemetry), O95 (webhooks fire only when conditions met)

---

## Latest Change (Overwritten Each Time)

<!-- CLAUDE_OVERWRITE_START -->
- **Date:** 2026-02-21
- **Phase:** 26 — Promotion Approval Notifications (Webhook-first)
- **Files modified:**
  - `shared/schema.ts` — Added `promotionWebhookUrl` to `environments` table, `notificationStatus`/`notificationLastError`/`notificationLastAttemptAt` to `promotionIntents` table, 2 telemetry event types (`graph.promotion_notification_sent`, `graph.promotion_notification_failed`). Updated `insertPromotionIntentSchema` to omit notification columns.
  - `migrations/0013_promotion_notifications.sql` (NEW) — ALTER TABLE for environments + promotion_intents.
  - `server/services/notificationService.ts` (NEW) — `sendWebhook(url, payload, timeoutMs)` with AbortSignal.timeout, never throws. `buildPromotionApprovalPayload` and `buildPromotionExecutedPayload` for Slack-compatible JSON.
  - `server/services/domainEventService.ts` — Added 2 event types to `DomainEventType` union.
  - `server/tenantStorage.ts` — Extended `updatePromotionIntent` Pick type to accept notification fields.
  - `server/graph/promotionIntentService.ts` — Added webhook notification after preview (when `requiresPromotionApproval && promotionWebhookUrl`) and after execute (when `promotionWebhookUrl`). Both are best-effort — failures tracked on intent and via telemetry.
  - `server/ec3l/index.ts` — Added `notification` to facade namespace.
  - `server/__tests__/promotionNotification.test.ts` (NEW) — 16 tests: sendWebhook pure tests (4), payload builders (2), notification triggering (4), intent state tracking (2), best-effort guarantee (2), telemetry (2).
  - `ai-context/EC3L_ARCHITECTURE_LEDGER.md` — Phase 26 entry + Latest Change.
  - `ai-context/08-operational-subsystems.md` — notificationService in catalog, 2 event types, emit sites, invariants O92–O95.
- **Architecture decisions:**
  - Notifications are best-effort: `sendWebhook` catches all errors and returns structured `{ success, error }`. A failed webhook never blocks preview or execute.
  - Preview notifications require BOTH `requiresPromotionApproval=true` AND `promotionWebhookUrl` configured. Execute notifications only require `promotionWebhookUrl` (all executions are notable).
  - Notification state tracked on intent (notificationStatus, notificationLastError, notificationLastAttemptAt) for execute-side notification, state is terminal so no DB update.
  - No retry mechanism (Phase 26 is webhook-first; retry/queue can be added later).
- **Invariants affected:** O92-O95 added
- **Next step:** Phase 27 candidates: webhook retry with exponential backoff, notification preferences per environment, real-time refinement streaming, field reordering, batch variant generation with diversity parameters, draft comparison across drafts.
<!-- CLAUDE_OVERWRITE_END -->

---

## File Index

| ai-context File | Covers |
|-----------------|--------|
| `00-goal.md` | Platform vision and goals |
| `01-architecture.md` | Core architecture, layers, data flow |
| `02-invariants.md` | Core invariants (C1–C12+) |
| `03-state-machine.md` | Change lifecycle state machine |
| `04-api-contracts.md` | API surface and contracts |
| `05-known-bugs-and-fixes.md` | Known issues and resolutions |
| `06-testing-playbook.md` | Test strategy and patterns |
| `07-servicenow-comparison.md` | ServiceNow conceptual mapping |
| `08-operational-subsystems.md` | Operational services, domain events, graph layer |
| `99-master-prompt.md` | Master prompt for AI context |
| `EC3L_ARCHITECTURE_LEDGER.md` | This file — structural change log |
