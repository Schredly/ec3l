# EC3L Architecture UX Ledger

This file tracks UI/UX structural changes to the EC3L platform. It serves as a single source of truth for what changed, when, and why — scoped to the client-side presentation layer.

**Maintained by:** Claude (automated on each UI phase completion)
**Format:** Append to the changelog. Overwrite the "Latest Change" section.
**Roadmap source:** `EC3L_UI_UX_Roadmap_v1.pdf`

---

## Design Philosophy

- **Replit-Level Elegance:** Clean, spacious, developer-native, minimal clutter, fast feedback loops.
- **Vercel-Level Team Coordination:** Changes as first-class, environment awareness (Dev/Test/Prod), promotion visibility, audit trails.
- **ServiceNow-Level Enterprise Depth:** Strong lifecycle visualization, governance clarity, operational dashboards, role-aware UI.
- **Primitive-Driven Composition:** Applications assembled from stable primitives; AI composes safely using existing building blocks.
- **Scoped Vibe Coding:** AI actions are localized, diffable, reversible, and always routed through Change.

---

## Roadmap Overview

| UI Phase | Title | Status |
|----------|-------|--------|
| 1 | Platform Shell + Context Awareness | Complete (1.1, 1.2, 1.3, 1.4) |
| 2 | Primitives as First-Class Citizens | In Progress (2.1 complete) |
| 3 | Change-Centric Development Model | Planned |
| 4 | Vibe Coding Everywhere | Planned |
| 5 | Integration Studio + Team Development | Planned |

---

## Changelog

### UI Phase 1.1 — AppShell Foundation
- **Date:** 2026-02-21
- **Files:**
  - `client/src/components/layout/AppShell.tsx` (NEW) — Full-height flex container composing Sidebar + TopContextBar + scrollable page content area.
  - `client/src/components/layout/Sidebar.tsx` (NEW) — 240px fixed sidebar with 4 role-aware sections (Workspace, Build, AI, Govern), gray-50 background, right border, logo header, system status footer.
  - `client/src/components/layout/TopContextBar.tsx` (NEW) — 56px top bar with title prop, DEV environment badge (amber pill), User badge (blue pill), ThemeToggle.
  - `client/src/App.tsx` (MODIFIED) — Replaced `SidebarProvider`/`AppSidebar`/`SidebarTrigger` layout with new `AppShell` wrapper. Removed shadcn sidebar imports. All routes, providers, and tenant bootstrap preserved.
- **Summary:** Introduced the foundational AppShell layout system replacing the previous shadcn SidebarProvider-based layout. The new layout uses a simple flex container with a static 240px sidebar (no collapsibility), a 56px top context bar, and a scrollable main content area with `max-w-[1280px]` centered + `p-6` padding. Navigation items redistributed from flat Navigation/Tools groups into semantic sections: Workspace (Dashboard, Projects), Build (Changes, Form Studio, Runner), AI (Vibe Studio, Agent Skills), Govern (Admin, Workflow Monitor, Records). Active state uses blue-50/blue-700 highlight. All existing routes, Wouter routing, TanStack Query, tenant bootstrap, and theme provider preserved. No server changes, no schema changes, no new API calls.
- **Architecture decisions:**
  - Replaced shadcn `SidebarProvider`/`Sidebar` with a plain Tailwind flex layout for full control over spacing, typography, and future customization.
  - Sidebar sections derived from roadmap role categories (Workspace/Build/AI/Govern) rather than generic Navigation/Tools.
  - TopContextBar badges are static placeholders — DEV and User pills will be wired to environment state and RBAC context in later phases.
  - Page content area applies `max-w-[1280px] mx-auto p-6` — individual pages retain their own internal padding/layout.
  - Old `app-sidebar.tsx` remains in codebase but is no longer imported. Can be removed in a cleanup pass.
- **UI Invariants:**
  - UX1: Layout is pure Tailwind — no additional UI frameworks introduced.
  - UX2: No sessions, cookies, or client-supplied tenant IDs introduced.
  - UX3: No routing changes — all 13 routes preserved exactly.
  - UX4: No new API calls — layout is presentation-only.
  - UX5: Sidebar sections match roadmap role categories.

### UI Phase 1.2 — Environment Awareness
- **Date:** 2026-02-21
- **Files:**
  - `client/src/hooks/useEnvironmentContext.ts` (NEW) — Hook that fetches projects, environments, and promotion intents via existing API endpoints. Returns `{ environment: "DEV"|"TEST"|"PROD", hasDrift: boolean, pendingPromotions: number, isLoading: boolean }`. Resolves environment label from highest-tier environment that exists across projects. Counts non-terminal promotion intents (draft/previewed/approved) as pending. Drift stubbed false pending a lightweight aggregation endpoint.
  - `client/src/components/layout/EnvironmentSelector.tsx` (NEW) — Environment pill component with color-coded styles (DEV=amber, TEST=blue, PROD=emerald), animated status dot, drift indicator (red pulsing dot, upper-right), pending promotions count badge (orange), hover tooltips. Read-only — no switching yet.
  - `client/src/components/layout/TopContextBar.tsx` (MODIFIED) — Replaced static DEV badge with live `<EnvironmentSelector />` component.
- **Summary:** Wired the TopContextBar to real environment state using existing API endpoints (`GET /api/projects`, `GET /api/projects/:id/environments`, `GET /api/admin/environments/promotions`). No new backend endpoints created. The environment pill is color-coded by tier with a subtle status dot, drift detection is visually wired (red pulsing dot) but data-stubbed until a dedicated drift summary endpoint exists, and pending promotions show as an orange count badge. All behavior is read-only — clicking does nothing (future phase). Custom tooltip component avoids new dependencies.
- **Architecture decisions:**
  - Uses TanStack Query with `staleTime: 60_000` (environments) and `30_000` (promotions) — avoids excessive re-fetching while staying reasonably current.
  - Environment resolution picks the highest tier that exists (PROD > TEST > DEV) — reflects the most "mature" environment in the tenant.
  - Drift detection stubbed as `false` — the existing `GET /api/admin/environments/diff` requires two specific environment IDs and is project-scoped, making it too expensive for a global shell indicator. Will be enabled when a lightweight drift summary endpoint is added.
  - Tooltip is a zero-dependency inline component (hover-based, absolute positioned) — no new libraries.
  - `getQueryFn({ on401: "returnNull" })` used so RBAC failures degrade gracefully (non-admin users see DEV with 0 promotions rather than an error).
- **UI Invariants:**
  - UX6: Environment indicator is read-only — no mutations, no switching.
  - UX7: All data sourced from existing endpoints — no new API contracts.
  - UX8: RBAC failures degrade gracefully — non-admin users see safe defaults.
  - UX9: Drift visual language is wired but data-stubbed — ready for backend support.

### UI Phase 1.3 — Reusable Status Badge System
- **Date:** 2026-02-21
- **Files:**
  - `client/src/components/status/StatusBadge.tsx` (NEW) — Generic badge component with `label`, `tone` (neutral/info/success/warning/danger/ai), `size` (sm/md), optional `icon` and `title` props. Centralized Tailwind styling: pill shape, subtle border, light background, readable text.
  - `client/src/components/status/statusTone.ts` (NEW) — Pure tone-mapping helpers for 5 domain status types: `getToneForChangeStatus`, `getToneForWorkflowExecutionStatus`, `getToneForSlaStatus`, `getToneForVibeDraftStatus`, `getToneForPromotionIntentStatus`. Unknown statuses safely resolve to "neutral".
  - `client/src/components/status/ChangeStatusBadge.tsx` (NEW) — Thin wrapper: Change lifecycle statuses (Draft/Implementing/WorkspaceRunning/Validating/ValidationFailed/Ready/Merged).
  - `client/src/components/status/WorkflowStatusBadge.tsx` (NEW) — Thin wrapper: Workflow execution statuses (pending/running/dispatched/completed/failed/duplicate).
  - `client/src/components/status/SlaStatusBadge.tsx` (NEW) — Thin wrapper: SLA statuses (pending/breached/completed). Handles null gracefully with "—" fallback.
  - `client/src/components/status/VibeDraftStatusBadge.tsx` (NEW) — Thin wrapper: Vibe draft statuses (draft/previewed/installed/discarded).
  - `client/src/components/status/PromotionIntentStatusBadge.tsx` (NEW) — Thin wrapper: Promotion intent statuses (draft/previewed/approved/executed/rejected).
  - `client/src/pages/changes.tsx` (MODIFIED) — Swapped import from `@/components/status-badge` to `@/components/status/ChangeStatusBadge`.
  - `client/src/pages/workflow-monitor.tsx` (MODIFIED) — Replaced `IntentStatusBadge` with `WorkflowStatusBadge`.
  - `client/src/pages/records.tsx` (MODIFIED) — Removed inline `SlaStatusBadge`, imported from `@/components/status/SlaStatusBadge`.
  - `client/src/pages/vibe-studio.tsx` (MODIFIED) — Removed `STATUS_COLORS`/`INTENT_STATUS_COLORS` maps, replaced 4 inline Badge usages with `VibeDraftStatusBadge` and `PromotionIntentStatusBadge`.
- **Summary:** Introduced a unified, composable status badge system replacing ad-hoc Badge variant maps and inline status components across 4 pages. The system uses a 6-tone color scale (neutral/info/success/warning/danger/ai) with centralized Tailwind styling in `StatusBadge.tsx` and domain-specific tone mappings in `statusTone.ts`. Each domain gets a thin wrapper component that maps status strings to tones. Applied to Changes list, Workflow Monitor, Records (SLA), and Vibe Studio (draft + promotion intent). Old `status-badge.tsx` retained for other consumers (project detail, etc.).
- **Architecture decisions:**
  - Tone-based system (6 semantic colors) rather than shadcn Badge variants — decouples status visual language from component library.
  - Pure mapping functions in `statusTone.ts` — no imports from server enums, just known string values with safe "neutral" fallback.
  - Thin wrappers per domain rather than a single mega-component — each wrapper is <20 lines, discoverable by name.
  - Old `status-badge.tsx` not deleted — it's still imported by pages not in scope (project-detail, etc.). Can be migrated incrementally.
- **UI Invariants:**
  - UX10: All status badges use the same 6-tone visual language.
  - UX11: Unknown statuses degrade to neutral — never crash.
  - UX12: No data fetching or business logic in badge components — pure rendering.
  - UX13: Badge styling centralized in StatusBadge.tsx — single source of truth.

### UI Phase 1.4 — Role-Aware Navigation Visibility
- **Date:** 2026-02-21
- **Files:**
  - `client/src/hooks/useRbacContext.ts` (NEW) — Hook that fetches user's roles via `GET /api/rbac/users/:userId/roles`, resolves permissions via `GET /api/rbac/roles/:id/permissions` per active role, and returns structured RBAC context: `isAdmin`, `isAgent`, `canApproveChange`, `canPromoteEnvironment`, `canExecuteWorkflow`, `canApproveWorkflow`, `canViewAdmin`, `canEditForm`, `rawPermissions`. Agent detection via `localStorage.getItem("agentId")`. All failures degrade to least privilege.
  - `client/src/components/layout/Sidebar.tsx` (MODIFIED) — Sidebar sections now render conditionally via `useVisibleSections()` hook that filters based on RBAC context. Workspace always visible. Build requires change/form permissions. AI requires workflow execute or edit permissions. Govern requires admin or promote permissions. Admin item only if `canViewAdmin`. Workflow Monitor only if `canExecuteWorkflow`/`canApproveChange`/`canApproveWorkflow`. Records always visible for non-agents. Agents: entire Govern section hidden. Hidden sections are fully removed from DOM (no placeholders, no disabled state). Shows all sections optimistically while RBAC is loading.
- **Summary:** Made sidebar navigation role-aware using existing RBAC endpoints. The `useRbacContext` hook fetches user roles and resolves permissions without any new backend endpoints. Sidebar sections are conditionally rendered based on permission checks — hidden items are fully removed from the DOM, not disabled. Agent actors have the entire Govern section hidden and cannot see approval-related navigation. Loading state is optimistic (show everything while RBAC resolves) to avoid layout flash. Permission data is cached for 2 minutes via TanStack Query `staleTime`.
- **Architecture decisions:**
  - Two-step permission resolution: roles → permissions per role. This avoids needing a new aggregate endpoint and uses the existing RBAC API surface.
  - Optimistic loading: sections show while RBAC loads, then hide if permissions deny. This prevents a jarring sidebar collapse on initial load. Server-side RBAC enforcement remains the real gate.
  - Agent detection via `localStorage.getItem("agentId")` — mirrors server-side `x-agent-id` header pattern. Currently unused by the client (no agent mode yet), but wired for future agent-mode toggle.
  - Visibility is UI-only convenience — routes still exist and server-side RBAC rejects unauthorized requests. This is explicitly NOT authorization.
  - `useMemo` on section computation to avoid re-rendering nav items on every render.
- **UI Invariants:**
  - UX14: Sidebar visibility is UI convenience, not authorization — server RBAC is the real gate.
  - UX15: RBAC failures degrade to least privilege — show only Workspace.
  - UX16: Agent actors cannot see Govern section or approval-related items.
  - UX17: Hidden sections fully removed from DOM — no disabled items, no placeholders.
  - UX18: Optimistic loading — show all sections while RBAC resolves to prevent layout flash.

### UI Phase 2.1 — Primitive Explorer (Hybrid View)
- **Date:** 2026-02-21
- **Files:**
  - `client/src/pages/primitives.tsx` (NEW) — Full Primitive Explorer page with master-detail layout. Left panel (60%) shows sortable record type table (Name, Key, Base Type, Fields count, Version, Status). Right panel (40%) shows detail for selected type: Identity (name, key, version, status badge), Inheritance (base type, inferred children), Fields table (name, type, required, default, reference), SLA & Assignment config, and MiniGraph visualization. Uses `GET /api/record-types` via TanStack Query. StatusBadge integration for draft/active/retired statuses.
  - `client/src/components/layout/Sidebar.tsx` (MODIFIED) — Added "Primitives" nav item to Build section, positioned after Changes.
  - `client/src/App.tsx` (MODIFIED) — Added Primitives import and `/primitives` route.
- **Summary:** Introduced the Primitive Explorer as the first deliverable of UI Phase 2 (Primitives as First-Class Citizens). The page provides a hybrid master-detail view for browsing record types and their schema architecture. The left panel lists all record types with key metadata columns. Clicking a row reveals a rich detail panel on the right showing identity, inheritance (with client-inferred children by scanning `baseType` across all types), field definitions in a table, SLA/assignment configuration, and a CSS-only MiniGraph showing parent → current → children relationships with connecting lines and arrows. All data sourced from the existing `GET /api/record-types` endpoint. No new API calls, no schema changes, no server modifications.
- **Architecture decisions:**
  - Children are inferred client-side by filtering `allTypes` where `baseType === current.key` — avoids a new endpoint while still surfacing the full inheritance tree.
  - MiniGraph is pure CSS (borders, w-px connectors, border-triangle arrows) — no SVG, no canvas, no charting library.
  - Schema fields parsed from `rt.schema.fields` (JSON column) with safe fallbacks for missing/null schemas.
  - SLA duration formatted adaptively: days for ≥1440m, hours for ≥60m, minutes otherwise.
  - Assignment config shows strategy, group, userId, and field match in a compact inline layout.
  - Responsive: stacks vertically on small screens (`flex-col`), side-by-side on `lg` (`flex-row`).
  - Primitives nav item gated by same Build section RBAC (form/change permissions) — no new permission checks needed.
- **UI Invariants:**
  - UX19: Primitive Explorer is read-only — no mutations, no creation, no editing.
  - UX20: All data from existing `GET /api/record-types` — no new API contracts.
  - UX21: Children inferred client-side from `baseType` field — no dedicated endpoint.
  - UX22: MiniGraph is pure CSS — no external charting dependencies.

---

## Latest Change (Overwritten Each Time)

<!-- CLAUDE_UX_OVERWRITE_START -->
- **Date:** 2026-02-21
- **Phase:** UI Phase 2.1 — Primitive Explorer (Hybrid View)
- **Files modified:**
  - `client/src/pages/primitives.tsx` (NEW) — Master-detail record type explorer with identity, inheritance, fields, SLA/assignment, and MiniGraph panels.
  - `client/src/components/layout/Sidebar.tsx` (MODIFIED) — Added "Primitives" to Build section.
  - `client/src/App.tsx` (MODIFIED) — Added `/primitives` route.
- **UI Invariants affected:** UX19–UX22 established.
- **UI Phase 2 status:** In progress. Phase 2.1 (Primitive Explorer) delivered. Phase 2.2 (Graph Relationship Viewer) and 2.3 (Template/Package Explorer) planned.
- **Next step:** UI Phase 2.2 — Graph Relationship Viewer.
<!-- CLAUDE_UX_OVERWRITE_END -->

---

## UI Phase Scope Reference

### UI Phase 1 — Platform Shell + Context Awareness
- Unified App Shell with persistent navigation and environment context ribbon.
- Role-aware left navigation: Workspace, Build, AI, Govern.
- Environment selector with drift and promotion indicators.
- Reusable status badge system for Change, Workflow, SLA, and Vibe drafts.

### UI Phase 2 — Primitives as First-Class Citizens
- Primitive Explorer with inheritance visualization and schema panels.
- Graph relationship viewer showing baseType, workflow bindings, and SLA connections.
- Template/package explorer with versioning and override indicators.

### UI Phase 3 — Change-Centric Development Model
- Change Board (PR-style lifecycle: Draft → Implementing → Ready → Merged).
- Change detail redesign with lifecycle stepper and graph diff viewer.
- Blast radius preview with dependency and environment impact summary.
- Workspace panel linking module, agent runs, and telemetry.

### UI Phase 4 — Vibe Coding Everywhere
- Scoped AI entry points across forms, workflows, integrations, and changes.
- Template-driven application composition wizard.
- Side-by-side variant comparison with risk and surface-area scoring.

### UI Phase 5 — Integration Studio + Team Development
- Integration Studio with connector catalog and credential vault UI.
- Promotion dashboard with Dev → Test → Prod visualization and drift heatmap.
- Team & RBAC management UI with actor log and agent action viewer.
- Executive dashboard for change velocity, SLA breaches, workflow health, and integration status.

---

## File Index

| File | Purpose |
|------|---------|
| `client/src/components/layout/AppShell.tsx` | Root layout wrapper — sidebar + top bar + content |
| `client/src/components/layout/Sidebar.tsx` | Static sidebar with role-aware sections |
| `client/src/components/layout/TopContextBar.tsx` | Top context bar with title, environment, badges, theme toggle |
| `client/src/components/layout/EnvironmentSelector.tsx` | Color-coded environment pill with drift + promotion indicators |
| `client/src/hooks/useEnvironmentContext.ts` | Hook aggregating environment state from existing API endpoints |
| `client/src/hooks/useRbacContext.ts` | Hook resolving user RBAC roles/permissions from existing endpoints |
| `client/src/components/status/StatusBadge.tsx` | Generic tone-based badge component (6 tones, 2 sizes) |
| `client/src/components/status/statusTone.ts` | Pure tone-mapping helpers for 5 domain status types |
| `client/src/components/status/ChangeStatusBadge.tsx` | Change lifecycle status badge |
| `client/src/components/status/WorkflowStatusBadge.tsx` | Workflow execution status badge |
| `client/src/components/status/SlaStatusBadge.tsx` | SLA timer status badge |
| `client/src/components/status/VibeDraftStatusBadge.tsx` | Vibe draft status badge |
| `client/src/components/status/PromotionIntentStatusBadge.tsx` | Promotion intent status badge |
| `client/src/pages/primitives.tsx` | Primitive Explorer — master-detail record type browser with MiniGraph |
| `client/src/components/app-sidebar.tsx` | Legacy sidebar (no longer imported, retained) |
| `client/src/App.tsx` | Root component — providers, routing, AppShell |
