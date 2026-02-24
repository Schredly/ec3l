# EC3L Sprint Ledger

> Tracks execution progress across the GPT-planned "Platform → Product" build.
> Updated by Claude after each completed step. Feed back to GPT for review.

---

## North Star

Take EC3L from "platform primitives exist" → "end-user apps exist + upgrade cleanly."
Close the Replit/Lovable/Bolt/v0 "product loop": end users open apps, admins evolve them, upgrades are governed.

## Hard Constraints (carried forward every sprint)

- **Stateless**: no sessions/cookies; identity via headers only (tenant + actor)
- **Tenant isolation**: slug resolved server-side; all queries tenant-scoped; never trust client UUIDs
- **Change as mutation choke-point**: all edits stay diffable/auditable
- **Apps are assemblies**: no bespoke app logic; apps reference primitives + engines + UI config + packages

---

## Sprint 1 — Apps Runtime Foundation ✅

**Goal:** End users can open an installed app (App Launcher + route group + manifest).

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 1.1 | Add `/t/:tenantSlug/apps` route group + AppsHomePage + AppDashboardPage | Done | Moved draft shell to `/builder/drafts/:appId` to free `/apps` for runtime |
| 1.2 | Installed Apps API: `GET /api/apps` + `GET /api/apps/:appKey` | Done | New `appService.ts` joins installedApps + templates + record types |

**Acceptance:** ✅ `/t/default/apps` lists installed apps. `/t/default/apps/foo` shows dashboard with record types.

---

## Sprint 2 — Record Experience ✅

**Goal:** Lists + Detail + Create flow usable inside an app.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 2.1 | Record list view: `/apps/:appKey/records/:recordTypeKey` | Done | Table with schema-aware columns, search filter, "New Record" button |
| 2.2 | Record detail + create: `/apps/:appKey/records/:recordTypeKey/:id` | Done | `id=new` for create mode; permission-aware (Viewer=read-only, Editor/Admin=save) |

**Acceptance:** ✅ Create record → view in list → open detail → edit/save. All through app-scoped URLs.

---

## Sprint 3 — Install + Upgrade System ✅

**Goal:** Versioned apps per tenant; install/upgrade feels like "projects" in Replit.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 3.1 | App Manage Page: `/apps/:appKey/manage` with version info | Done | Shows installed version, status, record types |
| 3.2 | Upgrade API: `POST /api/apps/:appKey/upgrade` | Done | Validates version ordering, calls `installGraphPackage`, emits `app.upgraded` domain event |

**Acceptance:** ✅ Manage page shows version, available upgrades, "Apply Upgrade" button. Preview Upgrade stubbed (disabled).

---

## Sprint 4 — App Builder UX Loop ✅

**Goal:** Template → Preview → Install wizard for creating apps.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 4.1 | Create App Wizard: `/build/apps/new` | Done | 4-step wizard: Choose Template → Configure → Preview → Install |

**Acceptance:** ✅ Admin opens wizard → picks template from catalog → sets name → reviews summary → installs → redirects to Apps.

---

## Sprint 5 — Modify + AI Proposal Loop ✅

**Goal:** Scoped Vibe → Diff → Upgrade for evolving existing apps.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 5.1 | "Propose Change with AI" on AppManagePage | Done | Modal accepts natural language → creates Vibe Draft → redirects to draft shell |
| 5.1 | "Create Change (PR)" link on AppManagePage | Done | Links to Changes page for PR-style editing |

**Acceptance:** ✅ "Propose Change with AI" opens modal, generates draft scoped to app, navigates to review.

---

## Sprint 6 — Governance + Polish ✅

**Goal:** Enterprise-ready surface; role-aware nav, audit, badges.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 6.1 | Navigation restructured: Apps / Build / Govern / Admin | Done | Role-based visibility; "My Apps" is now top-level entry; Admin section gated |

**Acceptance:** ✅ Viewer sees Apps section first. Admin sees Build/Govern/Admin. Agent-specific sections hidden.

## Sprint 7 — Workspace UX Re-Architecture ✅

**Goal:** Make default landing a unified Workspace dashboard. Shift nav from "system modules" to "user intent."

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 7.1 | Workspace Landing: `/workspace` with apps, changes, records, alerts | Done | New `WorkspacePage.tsx`; Sidebar gains "Workspace > Home" at top; `/` redirects to `/workspace` |

**Acceptance:** ✅ Landing on `/t/default/` redirects to `/workspace`. Shows installed apps (horizontal cards), active changes (last 5), record types summary, SLA alerts stub.

---

## Sprint 8 — App-Centric Experience Fix ✅

**Goal:** Replace developer-facing empty states with action-oriented UX on App Dashboard.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 8.1 | AppDashboardPage UX refactor: "Getting Started" + action buttons | Done | Empty state: Add Record Type, Configure Workflow, Propose Enhancement with AI. With records: card grid with "Open Records" CTA |

**Acceptance:** ✅ App with no record types shows "Getting Started" with 3 action buttons. App with record types shows interactive cards with "Open Records →" per type.

---

## Sprint 9 — Records Page Reframing ✅

**Goal:** Make record list context-aware to the parent app. Remove generic "Record Instances" language.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 9.1 | Contextualize RecordListPage header + empty state | Done | Header: "{App Name} — {Record Type Name}". Empty: "No {type} yet" + "Create First {type}" button. Search placeholder contextual. |

**Acceptance:** ✅ Record list shows "Facilities Request — Incident" instead of generic title. Empty state is action-oriented with contextual record type name.

---

## Sprint 10 — Install Completion Screen ✅

**Goal:** Make app installation feel like project creation, not a silent redirect.

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 10.1 | CreateAppWizard completion screen: "Your app is ready" | Done | Success shows app name, "Open App" + "Go to Workspace" buttons. No auto-redirect. |

**Acceptance:** ✅ After install completes, user sees "Your app is ready" with two navigation options instead of immediate redirect.

---

## Completed Work Log

### Sprint 1.1 — Apps Route Group
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/AppsHomePage.tsx` (new)
- `client/src/apps/AppDashboardPage.tsx` (new)
- `client/src/App.tsx` (modified — new routes, moved draft shell to `/builder/drafts/:appId`)
- `client/src/pages/BuilderLanding.tsx` (modified — updated draft navigation links)
- `client/src/pages/BuilderProposal.tsx` (modified — updated draft navigation link)
- `client/src/pages/AppDraftShell.tsx` (modified — updated draft navigation link)
- `client/src/pages/changes.tsx` (modified — updated draft navigation link)

**Summary:** Added `/apps` route group with AppsHomePage (grid of installed apps) and AppDashboardPage (app detail with record type list + manage link). Moved the existing AppDraftShell from `/apps/:appId` to `/builder/drafts/:appId` to cleanly separate runtime apps from builder drafts. Updated all 4 files that referenced the old draft path.

### Sprint 1.2 — Installed Apps API
**Date:** 2026-02-24
**Files touched:**
- `server/services/appService.ts` (new)
- `server/ec3l/index.ts` (modified — added `app` import)
- `server/routes.ts` (modified — added `GET /api/apps`, `GET /api/apps/:appKey`)

**Summary:** Created `appService.ts` with `listApps()` and `getAppByKey()`. The service joins `installedApps` → `templates` to derive `appKey` (slugified template name) and `displayName`. `getAppByKey` also resolves record types by tracing `installedModules` → `modules` → `projects` → `recordTypes`. Wired into ec3l namespace and registered routes.

### Sprint 2.1 — Record List View
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/RecordListPage.tsx` (new)
- `client/src/App.tsx` (modified — added route)

**Summary:** Record list page fetches record type by key, then lists instances in a table. Columns are auto-derived from schema fields (first 4). Includes search filter, "New Record" button (gated by RBAC), and row click → detail navigation.

### Sprint 2.2 — Record Detail + Create Flow
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/RecordDetailPage.tsx` (new)
- `client/src/App.tsx` (modified — added route)

**Summary:** Unified detail/create page. When `id=new`, renders empty form for creation. Otherwise loads instance and renders populated form. Schema-driven field rendering (text, number, boolean, date, datetime, choice). Save button disabled for Viewer role. Uses existing `POST /api/record-instances` and `PATCH /api/record-instances/:id`.

### Sprint 3.1 — App Manage Page
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/AppManagePage.tsx` (new)
- `client/src/App.tsx` (modified — added route)

**Summary:** Manage page shows installed version, status badge, available upgrade versions, record types list. "Preview Upgrade" is stubbed (disabled). "Apply Upgrade" button wired to upgrade mutation.

### Sprint 3.2 — Upgrade API
**Date:** 2026-02-24
**Files touched:**
- `server/services/appService.ts` (modified — added `upgradeApp()`)
- `server/services/domainEventService.ts` (modified — added `"app.upgraded"` event type)
- `server/routes.ts` (modified — added `POST /api/apps/:appKey/upgrade`)

**Summary:** Upgrade endpoint validates tenant owns the app, target version is newer, finds matching built-in package, calls `installGraphPackage()` from the graph engine, emits `app.upgraded` domain event. Returns `{ previousVersion, newVersion, status }`.

### Sprint 4.1 — Create App Wizard
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/CreateAppWizard.tsx` (new)
- `client/src/App.tsx` (modified — added route at `/build/apps/new`)

**Summary:** 4-step wizard: (1) Choose template from `GET /api/templates` catalog, (2) Configure app name, (3) Preview summary, (4) Install via `POST /api/templates/:id/install`. Includes step indicators, loading/error states, success redirect to `/apps`.

### Sprint 5.1 — AI Proposal Flow
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/AppManagePage.tsx` (modified — added AI proposal modal + PR link)

**Summary:** Added "Modify App" section with two buttons: "Propose Change with AI" (opens modal → creates Vibe Draft via `POST /api/vibe/drafts` → navigates to `/builder/drafts/:id`) and "Create Change (PR)" (navigates to Changes page). The AI proposal is scoped to the app name.

### Sprint 6.1 — Navigation Restructure
**Date:** 2026-02-24
**Files touched:**
- `client/src/components/layout/Sidebar.tsx` (modified — complete restructure)

**Summary:** Reorganized sidebar into 4 role-aware sections:
- **Apps** (always visible): My Apps, Records
- **Build** (Editor/Admin): Builder, Create App, Changes, Projects, Primitives, Shared Primitives, Form Studio, Vibe Studio
- **Govern** (non-agents with workflow/change permissions): Workflow Monitor, Runner, Agent Skills
- **Admin** (Admin role only): Admin Console, Dashboard

Agent-specific sections hidden. Viewer role sees only Apps section.

### Sprint 7.1 — Workspace Landing
**Date:** 2026-02-24
**Files touched:**
- `client/src/workspace/WorkspacePage.tsx` (new)
- `client/src/App.tsx` (modified — added route, import, changed default redirect from `/builder` to `/workspace`)
- `client/src/components/layout/Sidebar.tsx` (modified — added "Workspace > Home" section at top of nav)

**Summary:** Created `WorkspacePage.tsx` as the new default tenant landing. Four sections: (A) Your Apps — horizontal scrollable cards from `GET /api/apps` + "Install New App" ghost card, (B) Active Changes — last 5 from `GET /api/changes` with status badges, (C) Activity & Alerts — record types summary from `GET /api/record-types`, (D) SLA & Workflow Alerts — stub. Root redirect (`/`) and `RootRedirect` both now point to `/workspace`. Sidebar gains a "Workspace" section with "Home" link at the very top.

### Sprint 8.1 — App Dashboard UX
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/AppDashboardPage.tsx` (rewritten)

**Summary:** Replaced "No record types in this app yet." with an action-oriented "Getting Started" card containing 3 buttons: Add Record Type (→ `/primitives`), Configure Workflow (→ `/workflow-monitor`), Propose Enhancement with AI (→ manage page). When record types exist, shows interactive cards with blue icon, record type name/key, and "Open Records →" button. Manage button moved to header row. Better visual hierarchy: larger app name, version below, status badge inline.

### Sprint 9.1 — Contextualize Records
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/RecordListPage.tsx` (rewritten)

**Summary:** Added app context fetch (`GET /api/apps/:appKey`) to display "{App Name} — {Record Type Name}" as page header instead of just the record type name. "New Record" button now reads "New {Record Type Name}". Search placeholder is contextual ("Search incidents..."). Empty state redesigned: "No {Record Type Name} yet" with "Create First {Record Type Name}" button (RBAC-gated). Search empty state separate: "No {type} match your search."

### Sprint 10.1 — Completion Screen
**Date:** 2026-02-24
**Files touched:**
- `client/src/apps/CreateAppWizard.tsx` (modified — replaced auto-redirect with completion screen)

**Summary:** Removed `navigate("/apps")` from install `onSuccess`. Replaced the brief "Installed! Redirecting..." success state with a proper completion screen: green checkmark in circle, "Your app is ready." title, "{App Name} has been installed." subtitle, and two action buttons: "Open App" (navigates to `/apps/:appKey` using slugified name) and "Go to Workspace" (navigates to `/workspace`). Header subtitle changes to "All set!" on success.
