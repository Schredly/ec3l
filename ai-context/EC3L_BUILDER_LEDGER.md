# EC3L AI-Native Builder — Build Ledger

This file tracks implementation progress for the AI-Native Builder UI Build Plan. It serves as a coordination ledger between GPT (planning/instruction) and Claude (execution), scoped to the builder experience layer.

**Maintained by:** Claude (updated after each sprint deliverable)
**Format:** Append to the changelog. Overwrite the "Latest Status" section.
**Roadmap source:** `EC3L_AI_Native_Builder_UI_Build_Plan.pdf`

---

## Core Design Principle

The platform UI is not a configuration console. It is a guided AI-powered assembler of enterprise primitives with lifecycle governance.

---

## Phase & Sprint Map

| Phase | Title | Sprint | Status |
|-------|-------|--------|--------|
| 1 | Guided Onboarding Builder | Sprint 1 | Complete (UI scaffolding) |
| 2 | App Lifecycle Shell | Sprint 2 | Partial (draft shell delivered in Sprint 1) |
| 3 | Draft → Test → Publish Flow | Sprint 3 | Complete (3.1–3.6) |
| 4 | Shared Enterprise Primitives | Sprint 4 | In Progress (4.1–4.2 complete) |
| 5 | Tenant Awareness | Sprint 5 | In Progress (5.1, 5.1b, 5.2 complete) |
| 6 | Change Timeline Upgrade | Sprint 6 | In Progress (6.1 complete) |

---

## Phase Details

### Phase 1 — Guided Onboarding Builder (Sprint 1)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 1.1 | Replace Dashboard with Builder landing experience | Complete |
| 1.2 | Large AI prompt input with example enterprise system descriptions | Complete |
| 1.3 | Template cards (ITSM, HR, Facilities, Blank App) | Complete |
| 1.4 | AI Proposal Preview: structured view of primitives (Record Types, Workflows, Roles, Approvals, Notifications) | Complete |
| 1.5 | Convert Proposal to Draft: create Change + Snapshot in DEV environment | Complete |

**Backend dependencies:** Vibe LLM service (exists), Change creation (exists), Graph package install (exists), Snapshot creation (needs verification).

### Phase 2 — App Lifecycle Shell (Sprint 2)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 2.1 | App Overview page with Environment + Status indicator | Complete |
| 2.2 | Visual pipeline: DEV → TEST → PROD | Complete (static) |
| 2.3 | Tabs: Overview, Data Model, Workflows, Roles & Access, Changes | Complete (read-only, real data) |
| 2.4 | Promotion gating and approval visibility | Not Started |

**Backend dependencies:** Projects (exists), Environments (exists), Promotion intents (exists), Graph diff (exists).

### Phase 3 — Draft → Test → Publish Flow (Sprint 3)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 3.1 | Draft state allows AI + manual modifications | Complete (refinement loop + version history) |
| 3.2 | Every modification generates Patch + Snapshot + Change record | Complete (version snapshots + version diff) |
| 3.3 | Testing mode: simulate workflows, validate access, automated test hooks | Complete (preflight validation) |
| 3.4 | Publish modal shows diff from PROD with impact summary | Complete (promote modal + intent creation) |
| 3.5 | Pull Down Production: clone PROD snapshot to new DEV draft with lineage tracking | Complete |
| 3.6 | Lineage Metadata Hardening: structured JSONB lineage column replaces prompt-prefix encoding | Complete |

**Backend dependencies:** Patch ops (exists), Draft versioning (exists), Graph diff (exists), Promotion execute (exists). Pull-down-from-PROD may need a new service operation.

### Phase 4 — Shared Enterprise Primitives (Sprint 4)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 4.1 | Shared Primitives page: read-only view of tenant-level roles, assignments, SLAs, workflows | Complete |
| 4.2 | Shared primitive references: drafts reference by key, validated in preflight, tracked in diff | Complete |
| 4.3 | Encourage composition rather than siloed app creation | Not Started |

**Backend dependencies:** Record types and workflow definitions are already tenant-scoped. May need a "shared" scope concept or tagging.

### Phase 5 — Tenant Awareness (Sprint 4)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 5.1 | Tenant selector + header auto-injection: TenantProvider context, TenantSelector dropdown, queryClient.clear() on switch | Complete |
| 5.2 | Environment indicator in top bar | Partial (EnvironmentSelector exists from UX Phase 1.2) |
| 5.3 | Tenant drives X-Tenant-Id automatically | Complete (centralized via localStorage + TenantProvider) |
| 5.4 | Remove hardcoded tenant defaults | Not Started |

**Backend dependencies:** `GET /api/tenants` (exists). Middleware resolves slug → UUID (exists). Hardcoded `"user-admin"` fallback noted for cleanup.

### Phase 6 — Change Timeline Upgrade

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 6.1 | Changes page becomes version control timeline | Not Started |
| 6.2 | Diff viewer inline | Not Started |
| 6.3 | AI proposed badge + Human approved badge | Not Started |
| 6.4 | Inline Promote button | Not Started |
| 6.5 | Clear audit visibility | Not Started |

**Backend dependencies:** Change events (exists), Change patch ops (exists), Graph diff (exists), Promotion intents (exists). StatusBadge system ready (UX Phase 1.3).

---

## Existing Platform Capabilities (Available for Builder)

These backend services and UI components already exist and can be composed into the builder phases:

### Backend Services
- **Vibe LLM** — `server/vibe/` — AI generation with repair loop, streaming, draft versioning
- **Graph Package Install** — `server/graph/installGraphService.ts` — Atomic install of record types + workflows + forms
- **Graph Diff** — `server/graph/graphDiffService.ts` — Diff between environments
- **Promotion Intents** — `server/graph/promotionIntentService.ts` — Draft → preview → approve → execute lifecycle
- **Change Records** — `server/services/changeService.ts` — Full lifecycle with patch ops
- **Workflow Engine** — `server/services/workflowEngine.ts` — Step execution, triggers, intents
- **RBAC** — `server/services/rbacService.ts` — Permission checks, role seeding, self-introspection (`/api/rbac/me`)
- **Domain Events** — `server/services/domainEventService.ts` — Observable event bus
- **Telemetry** — `server/services/telemetryService.ts` — Execution telemetry

### UI Components
- **AppShell** — Sidebar + TopContextBar + content area (UX Phase 1.1)
- **EnvironmentSelector** — Color-coded pill with drift/promotion indicators (UX Phase 1.2)
- **StatusBadge system** — 6-tone badges for Change, Workflow, SLA, Vibe, Promotion (UX Phase 1.3)
- **RBAC-aware Sidebar** — Role-gated navigation sections (UX Phase 1.4)
- **Primitive Explorer** — Record type browser with inheritance graph (UX Phase 2.1)
- **Vibe Studio** — AI draft creation, preview, install (exists)
- **Changes page** — Change list with status badges (exists)
- **Workflow Monitor** — Execution tracking (exists)

### Key Client Infrastructure
- **TanStack Query** — All data fetching, caching, staleTime patterns
- **Wouter** — Client-side routing
- **queryClient.ts** — Central `apiRequest()`, `getQueryFn()`, tenant/user header injection
- **use-tenant.ts** — Bootstrap hook, slug-based tenant resolution
- **useRbacContext.ts** — Single-call RBAC self-introspection via `/api/rbac/me`
- **useEnvironmentContext.ts** — Environment tier + promotion count

---

## Changelog

### Sprint 1 — Builder Landing + Proposal Preview + Draft Shell
- **Date:** 2026-02-22
- **Files:**
  - `client/src/pages/BuilderLanding.tsx` (NEW) — Builder landing page with AI prompt textarea (min-height 140px, placeholder examples), "Generate Proposal" button (disabled when empty), 4 template cards (ITSM, HR, Facilities, Blank App) that prefill the textarea. Navigates to `/builder/proposal` with prompt as query param.
  - `client/src/pages/BuilderProposal.tsx` (NEW) — Split-screen proposal preview. Left panel: editable prompt + Regenerate button. Right panel: structured proposal with collapsible sections (Record Types, Roles, Workflows, Approvals, Notifications). Proposal generated client-side from keyword matching (no backend call). "Create Draft App" button navigates to `/apps/dev-draft`.
  - `client/src/pages/AppDraftShell.tsx` (NEW) — Draft app shell at `/apps/:appId`. Header with app name + Draft/DEV status badges. Environment pipeline visualization (DEV → TEST → PROD) as horizontal flex with color-coded stages. 5 tabs (Overview, Data Model, Workflows, Roles & Access, Changes) with placeholder content for non-overview tabs.
  - `client/src/App.tsx` (MODIFIED) — Added 3 new routes (`/builder`, `/builder/proposal`, `/apps/:appId`). Default route `/` now renders BuilderLanding instead of Dashboard. Dashboard moved to `/dashboard` route (not deleted).
  - `client/src/components/layout/Sidebar.tsx` (MODIFIED) — Workspace section: replaced "Dashboard" nav item with "Builder" pointing to `/`.
- **Summary:** Delivered Sprint 1 visual scaffolding for the AI-Native Builder. The full flow works: land on `/builder` → type prompt or pick template → "Generate Proposal" → see structured proposal with collapsible sections → "Create Draft App" → land on draft shell with environment pipeline and tabs. All backend calls stubbed. No server, schema, or RBAC changes. Proposal generation uses client-side keyword matching to simulate AI output.
- **Invariants:**
  - BLD1: No server modifications — all Sprint 1 is client-only visual scaffolding.
  - BLD2: Dashboard route preserved at `/dashboard` — not deleted, just no longer default.
  - BLD3: Proposal generation is client-side stub — ready to be replaced with real Vibe LLM call.
  - BLD4: Template cards prefill prompt text — they do not bypass the proposal flow.
  - BLD5: Draft shell tabs render placeholder content — ready for real data binding in Sprint 2.

### Sprint 2 — Wire Proposal + Draft Creation + Real Data Tabs
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added 3 builder endpoints: `GET /api/vibe/proposal` (read-only proposal generation from prompt via Vibe LLM/template layer, maps GraphPackage to human-readable proposal JSON), `POST /api/builder/drafts` (creates a vibe draft, resolves/creates default "Builder Apps" project, returns appId), `GET /api/builder/drafts/:appId` (fetches single draft with full package). None require admin auth.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `BuilderProposal` interface, `fetchProposal()`, `BuilderDraftResult` interface, `createBuilderDraft()`, `fetchBuilderDraft()`.
  - `client/src/hooks/useBuilderProposal.ts` (NEW) — React-query hook for fetching proposal from `GET /api/vibe/proposal?prompt=...`. 5-minute stale time, enabled only when prompt is non-empty.
  - `client/src/hooks/useAppDraft.ts` (NEW) — React-query hook for fetching draft by appId from `GET /api/builder/drafts/:appId`. 30-second stale time.
  - `client/src/pages/BuilderProposal.tsx` (MODIFIED) — Sprint 2.1: Replaced client-side keyword stub with server fetch via `useBuilderProposal`. Added loading skeleton, error state with Retry, Regenerate button that invalidates cache and re-fetches (with spinning indicator). Sprint 2.2: Wired "Create Draft App" button to `POST /api/builder/drafts` via `useMutation`. Shows `Loader2` spinner + "Creating Draft..." during creation. On success navigates to `/apps/:appId`. On error shows destructive toast.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Sprint 2.3: Full replacement. Fetches draft by `appId` route param via `useAppDraft`. Header shows real app name (humanized from packageKey), status badge (tone-mapped), DEV badge. 5 tabs with real data: **Overview** (app metadata grid, original prompt, summary count badges for record types/workflows/SLAs/assignments), **Data Model** (card per record type with full field table showing name/type/required), **Workflows** (card per workflow with trigger info and numbered step list), **Roles & Access** (assignment rules with strategy/group badges + SLA policies with duration), **Changes** (creation event card with timestamp/creator/checksum/status badge). Loading skeleton and error state included. Empty sections show graceful empty states.
- **Summary:** Sprint 2 connects the full Builder flow to real backend data. Proposal generation goes through the Vibe LLM adapter (Anthropic/OpenAI if API key configured, else stub template matching). Draft creation persists a real `vibe_package_drafts` row with GraphPackage, checksum, and version snapshot. Draft Shell tabs display all package contents (record types with fields, workflows with steps, assignment rules, SLA policies). No new database tables or migrations — reuses existing vibe draft infrastructure.
- **Invariants:**
  - BLD6: Builder endpoints (`/api/vibe/proposal`, `/api/builder/drafts`) do not require admin RBAC — accessible to all authenticated tenant users.
  - BLD7: Draft creation auto-resolves a default project ("Builder Apps") — Builder flow does not require manual project selection.
  - BLD8: Proposal endpoint is read-only — no DB writes, no side effects beyond domain events.
  - BLD9: Draft creation reuses `vibeDraftService.createDraftFromPrompt` — full vibe draft lifecycle (preview, refine, install, discard) available on created drafts.
  - BLD10: All Draft Shell tabs are read-only — no editing capabilities in Sprint 2.

### Sprint 3.1 — Refinement Loop + Version History
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added 3 builder endpoints: `POST /api/builder/drafts/:appId/refine` (calls `vibeDraftService.refineDraft`, supports LLM + deterministic pattern refinement), `GET /api/builder/drafts/:appId/versions` (lists all version snapshots), `GET /api/builder/drafts/:appId/versions/:version` (fetches single immutable version). None require admin auth.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `refineBuilderDraft()`, `fetchBuilderDraftVersions()`, `fetchBuilderDraftVersion()`.
  - `client/src/hooks/useRefineDraft.ts` (NEW) — `useMutation` hook wrapping refine endpoint. On success invalidates both `builder-draft` and `builder-draft-versions` query caches.
  - `client/src/hooks/useDraftVersions.ts` (NEW) — `useQuery` hook for version list. 10-second stale time.
  - `client/src/hooks/useDraftVersion.ts` (NEW) — `useQuery` hook for single version. `staleTime: Infinity` since versions are immutable.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Added two new sections to Overview tab: **Refinement Panel** (compact textarea + "Generate Refinement" button with loading spinner, success toast showing package key, error toast on failure, clears prompt on success) and **Version History Panel** (sorted newest-first, each row shows version number + reason label + "current" badge on latest + truncated checksum + relative timestamp, clicking a version expands inline preview card with record type/workflow/role/SLA counts + package key + creator).
- **Summary:** Sprint 3.1 adds the refinement loop and version history to the Draft Shell. Users can submit a refinement prompt (e.g. "add field priority to ticket", "rename to helpdesk") which calls `vibeDraftService.refineDraft` — this supports both LLM-based refinement (if API key configured) and deterministic pattern matching (add field, rename, add sla). Each refinement creates an immutable version snapshot. Version history is displayed as a clickable list with metadata preview. No restore functionality yet — read-only version inspection only.
- **Invariants:**
  - BLD11: Builder refinement/versioning endpoints do not require admin RBAC — consistent with BLD6.
  - BLD12: Each refinement creates an immutable version snapshot via `vibeDraftService` — reuses existing draft versioning infrastructure.
  - BLD13: Version snapshots are immutable (`staleTime: Infinity` on client) — versions are never modified after creation.
  - BLD14: Refinement resets draft status to "draft" if previously "previewed" — forces re-preview before install.
  - BLD15: Version history is read-only — no restore or rollback from the Builder UI in Sprint 3.1.

### Sprint 3.2 — Version-to-Version Diff
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added `GET /api/builder/drafts/:appId/diff?from=N&to=M` endpoint. Calls `diffDraftVersions()` from `draftVersionDiffService`, maps the full `GraphDiffResult` (record types, workflows, SLAs, assignments) into a builder-friendly response with `summary` (counts per category) and `changes` (added/removed/modified entity lists with field-level details for modified record types). No admin auth. Validates query params. Returns 400 for same-version or invalid params, 404 for missing draft/version.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `BuilderDiffChange` interface, `BuilderDiffResult` interface, `fetchBuilderDraftDiff()` function.
  - `client/src/hooks/useDraftDiff.ts` (NEW) — `useQuery` hook for version diff. 30-second stale time. Enabled only when both versions selected and different.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Added `CompareVersionsPanel` (two Select dropdowns for from/to version, Compare button, disabled unless valid selection), `DiffDisplay` (summary grid with per-category added/removed/modified counts, color-coded expandable sections with entity names and field-level details), `DiffSummaryCell`, `DiffChangeSection` helper components. Panel renders below Version History in Overview tab. Hidden when fewer than 2 versions exist.
- **Summary:** Sprint 3.2 adds read-only version-to-version structural comparison. The diff endpoint reuses the existing `diffDraftVersions()` service which projects both version packages onto a shared graph snapshot and computes deterministic diffs. The builder endpoint maps the raw `GraphDiffResult` (with `bindingChanges` for workflows/SLAs/assignments and `modifiedRecordTypes` with field-level adds/removes/type changes) into a human-readable format. The UI displays a summary grid (5 columns: Record Types, Workflows, SLA Policies, Assignments, Total) with green/red/amber counts, plus expandable detail sections listing each changed entity by name.
- **Invariants:**
  - BLD16: Builder diff endpoint does not require admin RBAC — consistent with BLD6, BLD11.
  - BLD17: Diff is read-only — no DB writes, no side effects beyond domain event emission.
  - BLD18: Diff reuses `diffDraftVersions()` from `draftVersionDiffService` — same projection and comparison logic as admin diff endpoint.
  - BLD19: Compare panel hidden when fewer than 2 versions exist — no diff possible without version history.
  - BLD20: No restore, merge, or promotion from diff view — read-only structural comparison only.

### Sprint 3.3 — Draft Preflight Validation
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added `GET /api/builder/drafts/:appId/preflight` endpoint. Loads current draft package and runs pure structural validation: record types (fields exist, field uniqueness, baseType references), workflows (record type references, step existence), SLAs (record type references, positive duration), assignments (record type references, valid strategy), RBAC (assignment group keys matched against tenant roles). Returns `{ status, summary, checks }`. No admin auth, no DB writes.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `PreflightCheck` interface, `PreflightResult` interface, `fetchBuilderDraftPreflight()` function.
  - `client/src/hooks/useDraftPreflight.ts` (NEW) — `useQuery` hook for preflight. `staleTime: 0` (always recompute). Accepts `enabled` flag so fetch only triggers on "Run Preflight" click.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Added "Preflight" tab to tab system. `PreflightTab` component with "Run Preflight" button, loading spinner, error display. `PreflightResults` component with color-coded status banner (green/amber/red with icon), checks grouped by category in cards, each check shows severity badge + entity + message. Empty state: "All validation checks passed. This draft is structurally ready for promotion."
- **Summary:** Sprint 3.3 adds draft preflight validation. The endpoint performs pure structural checks on the current draft package — no graph projection, no DB writes, no domain events. Validation covers 5 categories: record types (fields, uniqueness, baseType), workflows (target references, steps), SLAs (target references, duration), assignments (target references, strategy validity), and RBAC (assignment group keys matched against tenant roles with case-insensitive + underscore-to-space normalization). RBAC mismatches are warnings, not errors, since group keys and role names may intentionally diverge.
- **Invariants:**
  - BLD21: Builder preflight endpoint does not require admin RBAC — consistent with BLD6, BLD11, BLD16.
  - BLD22: Preflight is pure compute — no DB writes, no domain events, no state changes.
  - BLD23: Preflight runs against current draft package only — does not project onto graph snapshot or consider installed state.
  - BLD24: RBAC group-to-role matching is a warning, not an error — groups and roles are conceptually separate.
  - BLD25: Preflight result is not cached (`staleTime: 0`) — always reflects current draft state.

### Sprint 3.4 — Promotion UX Skeleton (DEV → TEST)
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added 2 builder endpoints: `POST /api/builder/drafts/:appId/promote-intent` (loads draft, resolves DEV/TEST environments by project, creates promotion intent via `ec3l.graph.createPromotionIntent`, returns `{ intentId, status, fromEnv, toEnv, createdAt, createdBy }`), `GET /api/builder/drafts/:appId/promote-intents` (lists project-scoped intents with human-readable env names). No admin auth. No execute action.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `BuilderPromotionIntent` interface, `createBuilderPromotionIntent()`, `fetchBuilderPromotionIntents()`.
  - `client/src/hooks/usePromotionIntents.ts` (NEW) — `useQuery` hook for intent list. 15-second stale time.
  - `client/src/hooks/useCreatePromotionIntent.ts` (NEW) — `useMutation` hook for creating intent. Invalidates `builder-promotion-intents` query on success.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Header: "Promote..." button (disabled unless preflight ran and status is not error, uses `queryClient.getQueryData` to peek at preflight cache). `PromoteModal` with Dialog: target display (DEV → TEST badges), readiness section (shows cached preflight result or inline "Run Preflight" CTA), impact preview (shows cached diff summary or guidance message), "Create Promotion Intent" button with spinner/toast. `PromotionIntentsPanel` in Overview tab: newest-first list with short ID, `PromotionIntentStatusBadge`, from→to, relative timestamp.
- **Summary:** Sprint 3.4 adds the promotion UX skeleton for builders. The "Promote..." button in the header is gated by preflight status — disabled until preflight has been run with a non-error result. The modal shows readiness (preflight), impact (cached version diff), and a create-intent action. Intent creation calls the existing `promotionIntentService.createPromotionIntent` which validates environments and emits domain events. No execute, approve, or reject actions — intent is created in "draft" status only. Promotion intents are listed in the Overview tab with the existing `PromotionIntentStatusBadge` component for consistent visual language.
- **Invariants:**
  - BLD26: Builder promote-intent endpoints do not require admin RBAC — consistent with BLD6, BLD11, BLD16, BLD21.
  - BLD27: Promote-intent creation is DEV → TEST only — hardcoded direction, no PROD promotion in Builder UI.
  - BLD28: No execute/approve/reject actions in Builder UI — intent is created as "draft" only.
  - BLD29: Promote button gated by preflight cache — disabled when no preflight result or status is "error".
  - BLD30: Intent creation reuses `promotionIntentService.createPromotionIntent` — full lifecycle (preview, approve, execute) available via admin endpoints.

### Sprint 3.5 — Pull Down from PROD
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added 2 builder endpoints: `GET /api/builder/drafts/:appId/prod-state` (checks if PROD has an installed package matching draft's packageKey, returns version/checksum/install metadata or `{ available: false }`), `POST /api/builder/drafts/:appId/pull-down` (loads PROD package contents from `environment_package_installs`, creates new draft via `vibeDraftService.createDraftFromVariant` with lineage prompt, returns `{ newAppId, version, lineage }`). No admin auth. No PROD mutation.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `ProdState` interface, `fetchBuilderProdState()`, `PullDownResult` interface, `pullDownFromProd()`.
  - `client/src/hooks/useProdState.ts` (NEW) — `useQuery` hook for PROD state. 30-second stale time.
  - `client/src/hooks/usePullDownDraft.ts` (NEW) — `useMutation` hook for pull-down. Invalidates draft and version queries on success.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Header: "Pull Down PROD" button (visible only when `prodState.available`). `PullDownModal` with Dialog: PROD info grid (package, version, install timestamp, source), amber warning ("existing DEV draft remains unchanged"), "Create DEV Draft from PROD" button with spinner. On success navigates to new draft and shows toast. Overview tab: lineage badge (green banner with "Pulled from PROD" when prompt starts with `[Pull-down from PROD]`).
- **Summary:** Sprint 3.5 adds the ability to clone a production-installed package into a new DEV draft. The flow: builder clicks "Pull Down PROD" → sees current PROD state and warning → confirms → server loads full `packageContents` from `environment_package_installs`, creates new draft via `createDraftFromVariant` with lineage metadata encoded in the prompt, returns new draft ID → client navigates to new draft. Existing DEV draft is never modified. New draft shows lineage banner in Overview. Lineage metadata includes source environment, version, checksum, timestamp, and source draft ID.
- **Invariants:**
  - BLD31: Pull-down endpoints do not require admin RBAC — consistent with BLD6, BLD11, BLD16, BLD21, BLD26.
  - BLD32: Pull-down never mutates PROD — reads `environment_package_installs` only.
  - BLD33: Pull-down does not overwrite or modify existing DEV draft — creates a new draft.
  - BLD34: Lineage metadata stored in draft `prompt` field — no schema changes required.
  - BLD35: "Pull Down PROD" button hidden when no PROD install exists for draft's packageKey.

### Sprint 3.6 (Micro) — Lineage Metadata Hardening
- **Date:** 2026-02-23
- **Files:**
  - `migrations/0014_draft_lineage.sql` (NEW) — `ALTER TABLE vibe_package_drafts ADD COLUMN lineage JSONB;`
  - `shared/schema.ts` (MODIFIED) — Added `lineage: jsonb("lineage")` to `vibePackageDrafts` table definition. Column is nullable, not omitted from insert schema (available at creation time).
  - `server/tenantStorage.ts` (MODIFIED) — Added `"lineage"` to `updateVibeDraft` Pick type so lineage can be updated after creation.
  - `server/vibe/vibeDraftService.ts` (MODIFIED) — `createDraftFromVariant()` now accepts optional `lineage?: Record<string, unknown>` parameter, spreads into `createVibeDraft` call.
  - `server/routes.ts` (MODIFIED) — `POST /api/builder/drafts/:appId/pull-down` now stores lineage as structured JSONB object (`{ pulledFromProd, sourceEnvironment, sourceVersion, sourceChecksum, sourceInstalledAt, sourceDraftId, pulledAt }`) passed to `createDraftFromVariant`. Prompt changed from `[Pull-down from PROD]\nSource...` multi-line encoding to clean `"Pulled from PROD (v1.0.0) at 2026-02-23T..."`.
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `DraftLineage` interface, added `lineage: DraftLineage | null` to `VibeDraft` interface.
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — `OverviewTab` now accepts `lineage` prop. Lineage banner uses `lineage?.pulledFromProd` instead of `prompt.startsWith("[Pull-down from PROD]")`. Banner shows version number and pull date from structured lineage data.
- **Summary:** Sprint 3.6 (micro) hardens lineage tracking by moving it from fragile prompt-prefix encoding to a dedicated nullable JSONB column on `vibe_package_drafts`. The pull-down endpoint now stores structured lineage metadata (source environment, version, checksum, timestamp, source draft ID) directly in the database column, and the client reads `draft.lineage` instead of parsing the prompt string. The prompt field is restored to a clean human-readable string. This is a non-breaking change — existing drafts without lineage simply have `null`.
- **Invariants:**
  - BLD34 (SUPERSEDED): Was "Lineage metadata stored in draft `prompt` field." Now superseded by BLD36.
  - BLD36: Lineage stored in dedicated `lineage` JSONB column — nullable, structured, queryable.
  - BLD37: Lineage column is nullable — existing drafts without lineage are unaffected (`null`).
  - BLD38: Pull-down prompt is now human-readable — no longer contains machine-parseable lineage markers.

### Sprint 4.1 — Shared Primitives Page
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added `GET /api/primitives/shared` endpoint. Aggregates tenant-level primitives from three sources: roles from `storage.getRbacRolesByTenant()`, SLA policies and assignment rules extracted from `recordTypes` JSONB configs (`slaConfig`, `assignmentConfig`), and workflow definitions from `ec3l.workflow.getWorkflowDefinitions()`. Returns `{ roles, assignmentRules, slaPolicies, workflows }`. No admin auth. No DB writes.
  - `client/src/lib/api/primitives.ts` (NEW) — `SharedRole`, `SharedAssignmentRule`, `SharedSlaPolicy`, `SharedWorkflow`, `SharedPrimitivesResult` interfaces. `fetchSharedPrimitives()` function.
  - `client/src/hooks/useSharedPrimitives.ts` (NEW) — `useQuery` hook for shared primitives. 30-second staleTime.
  - `client/src/pages/SharedPrimitives.tsx` (NEW) — Full page at `/shared-primitives`. Header: "Shared Enterprise Primitives". 4 tabs: Roles (card grid with name, status badge, "Tenant" scope badge, description), Assignments (card grid with record type name, strategy, group/field/user details, status), SLAs (card grid with record type name, formatted duration, status), Workflows (card grid with name, status, description, created date). All cards show "Tenant" scope badge. Empty states with icons per category. Loading skeleton. Error state.
  - `client/src/App.tsx` (MODIFIED) — Added import for `SharedPrimitives`, added `<Route path="/shared-primitives" component={SharedPrimitives} />`.
  - `client/src/components/layout/Sidebar.tsx` (MODIFIED) — Added `{ title: "Shared Primitives", url: "/shared-primitives" }` to Build section nav items.
- **Summary:** Sprint 4.1 adds a dedicated Shared Primitives page that surfaces tenant-level primitives in a read-only tabbed view. The aggregation endpoint queries three data sources (RBAC roles, record types for embedded SLA/assignment configs, workflow definitions) and returns a single response. SLA policies and assignment rules are extracted from the `slaConfig` and `assignmentConfig` JSONB fields on record types — there are no dedicated tables for these. All cards display a "Tenant" scope badge to clearly differentiate from app-scoped draft data. No mutation capability. No RBAC errors (endpoint has no admin auth requirement).
- **Invariants:**
  - BLD39: `GET /api/primitives/shared` does not require admin RBAC — consistent with BLD6, BLD11, BLD16, BLD21, BLD26, BLD31.
  - BLD40: Shared Primitives page is purely read-only — no create, edit, or delete actions.
  - BLD41: SLA policies and assignment rules are derived from record type configs — not stored in dedicated tables.
  - BLD42: All primitive cards display "Tenant" scope badge — visual differentiation from app-scoped draft data.

### Sprint 4.2 — Shared Primitive References in Drafts
- **Date:** 2026-02-23
- **Files:**
  - `client/src/lib/api/vibe.ts` (MODIFIED) — Added `SharedReference` interface (`{ entityType: "role" | "workflow" | "sla" | "assignment", key: string }`). Added `sharedReferences?: SharedReference[]` to `GraphPackageJson`. Updated `createBuilderDraft()` to accept optional `sharedReferences`. Added `sharedRefsAdded`/`sharedRefsRemoved` to `BuilderDiffResult.summary`. Added `"sharedReference"` to `PreflightCheck.type` union.
  - `server/routes.ts` (MODIFIED) — `POST /api/builder/drafts`: accepts optional `sharedReferences` in body, merges into draft package JSONB after LLM-based creation. `GET /api/builder/drafts/:appId/preflight`: validates `sharedReferences` against tenant primitives (roles by name, workflows by name, SLAs by record type key, assignments by record type key). Missing references → error. `GET /api/builder/drafts/:appId/diff`: computes shared reference diff from version packages, adds `sharedRefsAdded`/`sharedRefsRemoved` to summary and "Shared Reference" entries to changes.
  - `client/src/pages/BuilderProposal.tsx` (MODIFIED) — Added `SharedPrimitivesSelector` component: collapsible card with checkbox lists grouped by category (Roles, Workflows, SLAs, Assignments). Uses `useSharedPrimitives()` to populate. Selected count shown in header. Selections passed to `createBuilderDraft()` on "Create Draft App".
  - `client/src/pages/AppDraftShell.tsx` (MODIFIED) — Overview tab: added "Shared References" card below summary badges, listing each reference with entity-type badge and key. Visible only when `pkg.sharedReferences` exists and is non-empty.
- **Summary:** Sprint 4.2 enables drafts to reference shared tenant primitives by key rather than duplicating data. Users select primitives in the proposal flow, references are stored in `package.sharedReferences` JSONB, validated in preflight (checked against actual tenant data), and tracked in version diff. No migration needed — package is already flexible JSONB. No install logic changes — references are metadata only at this point.
- **Package JSON structure update:**
  ```json
  {
    "packageKey": "...",
    "version": "...",
    "recordTypes": [...],
    "sharedReferences": [
      { "entityType": "role", "key": "Admin" },
      { "entityType": "workflow", "key": "ticket_triage" }
    ]
  }
  ```
- **Preflight changes:** New `sharedReference` check category. Each reference validated against tenant primitives (roles by name, workflows by name, SLAs/assignments by record type key). Missing → error.
- **Diff changes:** `summary` gains `sharedRefsAdded`/`sharedRefsRemoved` counts. `changes.added`/`changes.removed` include `{ category: "Shared Reference", key: "role:Admin" }` entries.
- **Invariants:**
  - BLD43: Shared references stored in package JSONB — no schema migration, no new column.
  - BLD44: References are by key only — no primitive data copied into draft.
  - BLD45: Preflight validates reference existence against live tenant primitives — broken references → error.
  - BLD46: Diff tracks shared reference add/remove across versions.

---

### Sprint 5.1 — Tenant Selector + Header Auto-Injection
- **Date:** 2026-02-23
- **Files:**
  - `client/src/tenant/tenantStore.tsx` (NEW) — `TenantProvider` React context + `useTenantContext()` hook. Stores `activeTenant` (id, slug, name) in state. Initializes from localStorage on mount. `setActiveTenant()` persists slug to localStorage, calls `queryClient.clear()` to wipe all caches, and navigates to `/` via optional callback. No Redux, no external state library.
  - `client/src/components/layout/TenantSelector.tsx` (NEW) — Dropdown component using shadcn Select. Fetches tenant list via `GET /api/tenants` (no tenant headers — endpoint is above middleware). Shows "Tenant" label + current selection. If only one tenant, renders as static label. On change, calls `setActiveTenant()` which clears caches and navigates to `/`.
  - `client/src/components/layout/TopContextBar.tsx` (MODIFIED) — Inserted `TenantSelector` on left side next to page title, separated by vertical divider. Layout changed to flex with gap.
  - `client/src/hooks/use-tenant.ts` (MODIFIED) — `useTenantBootstrap()` now uses `useTenantContext()` to populate the TenantProvider on initial load. Hydrates context from localStorage if valid slug exists, else fetches from `/api/tenants` and sets both localStorage and context. Bootstrap writes `tenantName` and `tenantUuid` to localStorage alongside slug.
  - `client/src/App.tsx` (MODIFIED) — Wrapped app tree with `<TenantProvider>` inside `QueryClientProvider` so context has access to queryClient. Import added for `TenantProvider`.
- **Summary:** Sprint 5.1 adds Vercel-like tenant switching to the top bar. The `TenantProvider` context is the single source of truth for tenant identity. The existing `queryClient.ts` `tenantHeaders()` function continues to read `localStorage.getItem("tenantId")` for header injection — `setActiveTenant()` writes to localStorage first, then clears the query cache. This means header injection remains centralized in `queryClient.ts` (the `tenantHeaders()` function used by both `apiRequest()` and `getQueryFn()`), and all downstream code benefits from the switch without per-call header manipulation. No cookies, no sessions, no server changes.
- **Header injection centralization:** `client/src/lib/queryClient.ts` → `tenantHeaders()` reads `localStorage.getItem("tenantId")` and `localStorage.getItem("userId")`, returns `{ "x-tenant-id": slug, "x-user-id": userId }`. Used by both `apiRequest()` and `getQueryFn()`. No per-request header setting needed.
- **Cache invalidation on switch:** `queryClient.clear()` in `tenantStore.tsx` → wipes all cached queries and mutations. Combined with navigation to `/`, ensures no stale cross-tenant data.
- **Invariants:**
  - BLD47: TenantProvider is the single source of truth for active tenant identity in the UI.
  - BLD48: Header injection centralized in `queryClient.ts tenantHeaders()` — reads localStorage, not context directly, for simplicity.
  - BLD49: Tenant switch calls `queryClient.clear()` + navigates to `/` — prevents stale cross-tenant data.
  - BLD50: `GET /api/tenants` is above tenant middleware — no chicken-and-egg problem.
  - BLD51: No cookies, no sessions — tenant identity is slug in localStorage + x-tenant-id header.

### Sprint 5.1b — Tenant Hardening (Module-Level State Bridge)
- **Date:** 2026-02-23
- **Files:**
  - `client/src/lib/activeTenant.ts` (NEW) — Module-level getter/setter bridge for tenant slug and user ID. Avoids circular dependency between `tenantStore.tsx` and `queryClient.ts`. Default values: `"default"` for slug, `"user-admin"` for userId. Both `queryClient.ts` and `tenantStore.tsx` import from this module without depending on each other.
  - `client/src/lib/queryClient.ts` (MODIFIED) — `tenantHeaders()` now reads from `getActiveTenantSlug()` and `getActiveUserId()` (module-level getters) instead of `localStorage.getItem()`. `setTenantId()` writes to both module state via `setActiveTenantSlug()` and localStorage. `setUserId()` writes to both module state via `setActiveUserId()` and localStorage. Removed direct localStorage reads from live header injection path.
  - `client/src/tenant/tenantStore.tsx` (MODIFIED) — `TenantProvider` initializer now calls `setActiveTenantSlug(slug)` during bootstrap to hydrate module-level state from localStorage. `setActiveTenant()` calls `setTenantId()` (which updates both module state and localStorage), then updates React state, then calls `queryClient.clear()`.
  - `client/src/hooks/use-tenant.ts` (MODIFIED) — Minor comment updates. No functional changes since `setTenantId()` was refactored upstream to handle both module state and localStorage writes.
- **Summary:** Sprint 5.1b hardens tenant header injection by removing direct localStorage reads from the live request path. A new `activeTenant.ts` module provides dependency-free getter/setter functions for tenant slug and user ID. `queryClient.ts` reads from these module-level getters (synchronous, no I/O) instead of `localStorage.getItem()`. The write path (`setTenantId()`) updates both module state and localStorage for persistence. This eliminates the risk of stale localStorage reads and avoids a circular dependency between `tenantStore.tsx` and `queryClient.ts`.
- **Circular dependency resolution:** `tenantStore.tsx` imports from `queryClient.ts` (for `queryClient` and `setTenantId`). If `queryClient.ts` imported from `tenantStore.tsx`, it would create a cycle. `activeTenant.ts` is a leaf module with no imports — both `queryClient.ts` and `tenantStore.tsx` can safely import from it.
- **Invariants:**
  - BLD48 (SUPERSEDED): Was "Header injection reads localStorage." Now superseded by BLD52.
  - BLD52: Header injection reads from module-level getters (`getActiveTenantSlug()`, `getActiveUserId()`) — no localStorage in the hot path.
  - BLD53: `activeTenant.ts` is a dependency-free leaf module — no imports, avoids circular dependency.
  - BLD54: Write path (`setTenantId()`) updates both module state and localStorage — module state for immediate header injection, localStorage for persistence across page reloads.

### Sprint 5.2 — URL-Scoped Tenancy
- **Date:** 2026-02-23
- **Files:**
  - `client/src/App.tsx` (MODIFIED) — Major restructure. Removed flat `Router` component and `AppContent` with `useTenantBootstrap`. Added `TenantRouteSync` component that syncs URL tenant slug to module-level state + TenantProvider: sets `setActiveTenantSlug()` synchronously during render for immediate header correctness, uses `useLayoutEffect` to persist to localStorage and clear cache on actual tenant switch (before paint), fetches tenant list via useQuery to validate slug and hydrate TenantProvider with full info (id, name). Added `TenantScopedRoutes` component containing all existing routes under `<Route path="/t/:tenantSlug" nest>` — wouter's nesting strips the prefix so all child routes, Links, and useLocation calls work with relative paths automatically. Added `RootRedirect` component that reads `localStorage.getItem("tenantId") || "default"` and redirects to `/t/{slug}/builder`. Top-level Switch: nested tenant route + catch-all redirect.
  - `client/src/tenant/tenantStore.tsx` (MODIFIED) — Removed localStorage initialization from `TenantProvider` (URL drives state now, initial state is `null`). Removed `setActiveTenantSlug` import (no longer needed in initializer). Updated `setActiveTenant`: removed `navigate` parameter, added conditional `queryClient.clear()` that only fires when slug actually changed (`getActiveTenantSlug() !== tenant.slug`) — prevents wiping freshly-fetched queries when TenantRouteSync hydrates full info after module-level slug is already correct. Updated `TenantContextValue` interface to match.
  - `client/src/components/layout/TenantSelector.tsx` (MODIFIED) — Replaced wouter `useLocation` navigate with `navigate` import from `wouter/use-browser-location` for absolute cross-tenant navigation. On tenant switch: calls `navigate(/t/${slug}/builder)` — bypasses wouter's nested router base prefix. Removed `setActiveTenant` call and `useLocation` hook — TenantRouteSync handles context sync when the URL changes.
  - `client/src/components/layout/Sidebar.tsx` (MODIFIED) — Changed Builder nav item URL from `"/"` to `"/builder"`. Inside wouter's nested context, `<Link href="/builder">` automatically resolves to `/t/{slug}/builder`. All other nav URLs unchanged — wouter nesting handles the `/t/:tenantSlug` prefix transparently.
- **Summary:** Sprint 5.2 moves tenant identity from localStorage-driven to URL-scoped. All builder routes are now under `/t/:tenantSlug/...` (e.g., `/t/acme/builder`, `/t/acme/apps/123`). Wouter v3's `<Route nest>` creates a sub-router that strips the `/t/:tenantSlug` prefix — all existing `Link`, `useLocation`, and `useParams` calls within pages work unchanged with relative paths. TenantRouteSync is the bridge between URL and application state: it sets the module-level slug synchronously (for headers), persists to localStorage (for root redirect on refresh), and hydrates TenantProvider context (for UI display). The TenantSelector uses absolute navigation (`wouter/use-browser-location`) to cross tenant boundaries. Bare `/` redirects to `/t/{lastSlug}/builder`.
- **Routing architecture:**
  ```
  /                           → Redirect to /t/{localStorage.tenantId || "default"}/builder
  /t/:tenantSlug/             → Redirect to /t/:tenantSlug/builder
  /t/:tenantSlug/builder      → BuilderLanding
  /t/:tenantSlug/apps/:appId  → AppDraftShell
  /t/:tenantSlug/projects     → Projects
  /t/:tenantSlug/changes/:id  → ChangeDetail
  /t/:tenantSlug/admin        → AdminConsole
  /t/:tenantSlug/*            → NotFound
  /anything-else              → Redirect to /t/{slug}/builder
  ```
- **Tenant resolution flow:**
  1. URL provides slug → `TenantRouteSync` sets module-level state synchronously during render
  2. `useLayoutEffect` persists to localStorage + clears cache (only on actual slug change, before paint)
  3. `useEffect` fetches `/api/tenants`, validates slug, hydrates TenantProvider with `{ id, slug, name }`
  4. `tenantHeaders()` reads module-level slug for every API call — always correct from step 1
- **Invariants:**
  - BLD55: All routes scoped under `/t/:tenantSlug` — URL is the source of truth for tenant identity.
  - BLD56: Wouter `<Route nest>` strips tenant prefix — all child components use relative paths. No page component changes required.
  - BLD57: Module-level slug set synchronously during render — `tenantHeaders()` returns correct value before any child query fires.
  - BLD58: Cache cleared only on actual tenant switch (slug diff) — prevents double-clear when TenantRouteSync hydrates full info.
  - BLD59: TenantSelector uses absolute navigation (`wouter/use-browser-location`) — bypasses nested router base for cross-tenant URLs.
  - BLD60: Root redirect reads localStorage for last-used tenant — no API call needed for redirect.
  - BLD49 (UPDATED): Tenant switch now navigates to `/t/{slug}/builder` (was `navigate("/")`) — URL drives the switch, TenantRouteSync handles cache clear.
  - BLD51 (UPDATED): Tenant identity is URL slug + `x-tenant-id` header — localStorage is for persistence only, not for live header injection.

### Sprint 6.1 — Unified Change Timeline (Read-Only)
- **Date:** 2026-02-23
- **Files:**
  - `server/routes.ts` (MODIFIED) — Added `GET /api/changes/timeline` endpoint. Placed before `/api/changes/:id` to prevent `:id` param from capturing "timeline". Aggregates 4 data sources: (1) change records via `ts.getChanges()`, (2) promotion intents via `ts.listPromotionIntents()` with environment name resolution via `ts.getEnvironmentsByProject()`, (3) draft versions via `ts.listVibeDraftVersions()` for each draft from `ts.listVibeDrafts()`, (4) pull-down lineage entries filtered from drafts where `lineage.pulledFromProd === true`. Returns unified array sorted newest-first. No RBAC admin requirement. No DB writes.
  - `client/src/lib/api/timeline.ts` (NEW) — `TimelineEntryType` union type (`"change" | "draft" | "promotion-intent" | "pull-down"`), `TimelineEntry` interface, `fetchTimeline()` function.
  - `client/src/hooks/useTimeline.ts` (NEW) — `useQuery` hook for timeline data. 15-second staleTime.
  - `client/src/pages/changes.tsx` (MODIFIED) — Replaced flat change list with unified timeline layout. `TimelineEntryCard` component with color-coded type badges (blue for change/draft, amber for promotion, violet for pull-down), status badges with tone mapping, environment arrow badges (from → to), relative timestamps, createdBy, and type-specific icons. Change entries link to `/changes/:id`, draft entries link to `/apps/:draftId`. Empty state updated for timeline context.
- **Summary:** Sprint 6.1 upgrades the /changes page into a unified timeline view that aggregates all tenant activity into a single chronological stream. The endpoint queries 4 data sources (changes, promotion intents, draft versions, pull-down lineage) and merges them by timestamp. The UI uses color-coded cards with the existing `StatusBadge` system for consistent visual language. No mutation capability, no lifecycle changes — pure aggregation + visualization.
- **Timeline entry types:**
  - `change` — Change records with status lifecycle (Draft → Merged)
  - `draft` — Vibe draft version snapshots with reason and package key
  - `promotion-intent` — Environment promotion requests with from/to badges
  - `pull-down` — PROD → DEV pull-down events from lineage metadata
- **Invariants:**
  - BLD61: Timeline endpoint is read-only — no DB writes, no state changes, no domain events.
  - BLD62: Timeline endpoint does not require admin RBAC — consistent with BLD6, BLD11, BLD16, BLD21, BLD26, BLD31, BLD39.
  - BLD63: Timeline is tenant-scoped — all data sources query via `getTenantStorage(ctx)`.
  - BLD64: Route ordering: `/api/changes/timeline` registered before `/api/changes/:id` to prevent param capture.
  - BLD65: No inline diff in Sprint 6.1 — read-only cards with navigation links to detail views.

---

## Latest Status (Overwritten Each Time)

<!-- CLAUDE_BUILDER_OVERWRITE_START -->
- **Date:** 2026-02-23
- **Phase:** Sprint 6.1 — Unified Change Timeline (Phase 6 started)
- **Status:** Sprint 6.1 complete. /changes page is now a unified timeline.
- **Files added:** `client/src/lib/api/timeline.ts`, `client/src/hooks/useTimeline.ts`
- **Files modified:** `server/routes.ts` (timeline aggregation endpoint), `client/src/pages/changes.tsx` (timeline UI)
- **Endpoints added:** `GET /api/changes/timeline` (aggregates changes, promotions, drafts, pull-downs)
- **Invariants:** BLD61–BLD65 established. All prior invariants remain valid.
- **What's stubbed:** Inline diff expansion not yet implemented (cards link to detail views instead). Pagination not implemented.
- **Assumptions:** Draft version queries are per-draft (N+1 pattern) — acceptable for tenant-scoped data volume. Environment name resolution cached per request. Pull-down entries derived from `lineage.pulledFromProd` JSONB field.
- **Next step:** Sprint 6.2+ — inline diff viewer, AI/Human badges, promote button. Sprint 5.3+ — remove hardcoded defaults.
- **Blockers:** None.
<!-- CLAUDE_BUILDER_OVERWRITE_END -->

---

## Coordination Protocol

1. **GPT** sends phase/sprint instructions with deliverable specs.
2. **Claude** executes, updates this ledger with changelog entry + latest status.
3. **GPT** reads the latest status section to understand current state before sending next instructions.
4. All file changes are tracked in changelog entries with file paths, action (NEW/MODIFIED), and summary.
5. Invariants are numbered sequentially (BLD1, BLD2, ...) and accumulate across phases.
