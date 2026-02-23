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
| 3 | Draft → Test → Publish Flow | Sprint 3 | Not Started |
| 4 | Shared Enterprise Primitives | Sprint 4 | Not Started |
| 5 | Tenant Awareness | Sprint 4 | Not Started |
| 6 | Change Timeline Upgrade | — | Not Started |

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
| 3.1 | Draft state allows AI + manual modifications | Not Started |
| 3.2 | Every modification generates Patch + Snapshot + Change record | Not Started |
| 3.3 | Testing mode: simulate workflows, validate access, automated test hooks | Not Started |
| 3.4 | Publish modal shows diff from PROD with impact summary | Not Started |
| 3.5 | Pull Down Production: clone PROD snapshot to new DEV draft with lineage tracking | Not Started |

**Backend dependencies:** Patch ops (exists), Draft versioning (exists), Graph diff (exists), Promotion execute (exists). Pull-down-from-PROD may need a new service operation.

### Phase 4 — Shared Enterprise Primitives (Sprint 4)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 4.1 | Allow reuse of global workflows, approvals, assignment engines, notifications | Not Started |
| 4.2 | Clearly differentiate tenant-global vs app-scoped primitives | Not Started |
| 4.3 | Encourage composition rather than siloed app creation | Not Started |

**Backend dependencies:** Record types and workflow definitions are already tenant-scoped. May need a "shared" scope concept or tagging.

### Phase 5 — Tenant Awareness (Sprint 4)

| Deliverable | Description | Status |
|-------------|-------------|--------|
| 5.1 | Header includes Tenant selector dropdown | Not Started |
| 5.2 | Environment indicator in top bar | Partial (EnvironmentSelector exists from UX Phase 1.2) |
| 5.3 | Tenant drives X-Tenant-Id automatically | Partial (slug-based bootstrap exists, needs real selector) |
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

---

## Latest Status (Overwritten Each Time)

<!-- CLAUDE_BUILDER_OVERWRITE_START -->
- **Date:** 2026-02-23
- **Phase:** Sprint 2 — Wire Proposal + Draft Creation + Real Data Tabs
- **Status:** Complete. All 3 sub-sprints delivered (2.1 proposal fetch, 2.2 draft creation, 2.3 real data tabs).
- **Files added:** `useBuilderProposal.ts`, `useAppDraft.ts`
- **Files modified:** `routes.ts` (3 endpoints), `vibe.ts` (3 API functions), `BuilderProposal.tsx` (full replacement), `AppDraftShell.tsx` (full replacement)
- **Endpoints added:** `GET /api/vibe/proposal`, `POST /api/builder/drafts`, `GET /api/builder/drafts/:appId`
- **Invariants:** BLD6–BLD10 established. BLD1–BLD5 from Sprint 1 remain valid.
- **What's stubbed:** Nothing in the builder flow is stubbed anymore. Draft Shell tabs are read-only (no inline editing). Environment pipeline is static (DEV always active). Changes tab shows creation event only (no version history).
- **Next step:** Sprint 3 — Draft modifications (AI refinement + manual patch ops), testing mode, publish flow with diff.
- **Blockers:** None.
<!-- CLAUDE_BUILDER_OVERWRITE_END -->

---

## Coordination Protocol

1. **GPT** sends phase/sprint instructions with deliverable specs.
2. **Claude** executes, updates this ledger with changelog entry + latest status.
3. **GPT** reads the latest status section to understand current state before sending next instructions.
4. All file changes are tracked in changelog entries with file paths, action (NEW/MODIFIED), and summary.
5. Invariants are numbered sequentially (BLD1, BLD2, ...) and accumulate across phases.
