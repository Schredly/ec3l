According to a document from **2026-02-21**, you *do* have the right platform base: a stateless, multi-tenant control plane with tenant header enforcement (`x-tenant-id`), governed Change → PatchOps, installable Graph Packages + Vibe Drafts, and a React SPA shell that already routes by `/t/:tenantSlug/...` and hydrates tenant context. The missing piece is the **Replit/Lovable/Bolt/v0 “product loop”**: an end user can open an app, use it, and an admin can evolve it and **upgrade** existing installs in-place—without breaking tenancy or governance.

Below is a development plan you can hand to Claude to take EC3L from “platform primitives exist” → “end-user apps exist + upgrade cleanly”.

---

## North-star outcome we’re building toward

1. **End-user runtime (“Apps”)**

* A tenant can open an app and **create/view/edit records** through compiled forms + lists (no builder context needed).
* Navigation is app-scoped and role-aware.

2. **Admin authoring (“Build”)**

* A tenant admin can **create an app from templates/packages**, then iteratively modify it via:

  * Change (manual PR-style edits), and/or
  * Vibe Draft (AI-proposed packages), with compare/preview/diff.

3. **Upgrade model (“Install + Upgrade”)**

* When an app changes, existing tenant installs can be **upgraded** (think: package version bump).
* Tenant-specific overrides remain tenant-specific; upgrades are previewable + diffable + reversible, routed through governance.

This aligns directly to the North Star’s “apps are assemblies” and “industry solutions are installable graphs, not forks,” plus “scoped vibe coding” and “UI/UX as a first-class platform system.”

---

## Plan structure (4 workstreams, executed in phases)

### Workstream A — “Apps Runtime” (end users)

Goal: make **Record Instance Runtime + App navigation** real and polished. This corresponds to the roadmap’s record instance + UI requirement (list + detail + inline compiled form rendering).

Deliverables:

* App shell mode: `/apps/:appKey/...`
* Record list view (by record type)
* Record detail view (compiled form renderer)
* Create record flow
* Permission-aware actions (Viewer vs Editor vs Admin)

### Workstream B — “Install + Upgrade” (package lifecycle per tenant)

Goal: make “installed apps” feel like Replit projects: you can install, see version, preview upgrade, and apply it.

Deliverables:

* Installed apps page per tenant (installed packages, versions, status)
* Upgrade flow:

  * choose target version
  * preview diff
  * run upgrade
  * show status + audit trail

### Workstream C — “Builder UX loop” (Build → Preview → Install/Upgrade)

Goal: unify “vibe authoring” and “change-centric” into a single, obvious loop.

Deliverables:

* “Create App” wizard: Template → Configure → Preview → Install
* “Modify App” entry points:

  * “Propose with AI” (Vibe Draft)
  * “Edit with Change” (PR-style)
* “Preview” always includes a blast-radius-ish summary and diff viewer (even if v1 is minimal), because the entire platform is built around deterministic, audited change.

### Workstream D — “Polish + discoverability” (make it feel like a product)

Goal: the flow is obvious, not “developer UI”.

Deliverables:

* Role-aware nav: Workspace / Apps / Build / Govern (matches the UI roadmap philosophy)
* Empty states that guide: “Install your first app”, “Create your first record type”, etc.
* Consistent status badges for Change / Vibe / Install / Promotion (v1)

---

## Phase-by-phase execution plan for Claude (copy/paste into tickets)

### Phase 1 — Make the “Apps Runtime” real (end-user usable)

**Objective:** A non-admin can use an installed app to manage records.

**1. Add an “Apps” route group**

* Routes:

  * `/t/:tenantSlug/apps` (app launcher)
  * `/t/:tenantSlug/apps/:appKey` (app home/dashboard placeholder)
  * `/t/:tenantSlug/apps/:appKey/records/:recordTypeKey` (list)
  * `/t/:tenantSlug/apps/:appKey/records/:recordTypeKey/:id` (detail)

**2. Define “App Manifest” (thin v1)**

* An app = installed package + a manifest describing:

  * primary record types
  * nav items (Records, Dashboards later)
* v1 can live as metadata on the package install record; later becomes a first-class UI config object (per North Star’s “UI as structured configuration”).

**3. Ship record list + detail**

* Use existing record instance CRUD and “inline compiled form rendering” direction from roadmap.
* Required UX:

  * list page: filter/search (simple), “New” (Editor/Admin only)
  * detail page: compiled form renderer, save (Editor/Admin), read-only for Viewer

**Acceptance criteria**

* From a clean tenant, install a template app → create record → view in list → open detail → edit/save.
* No builder pages needed to use it.

---

### Phase 2 — “Install + Upgrade” becomes first-class

**Objective:** package install feels like “projects” in Replit: clear, versioned, upgradable.

**1. Installed Apps UI**

* `/t/:tenantSlug/apps` shows:

  * installed apps (packageKey, display name, installed version, status)
  * “Open” and “Manage” actions

**2. Upgrade flow UI**

* `/t/:tenantSlug/apps/:appKey/manage`

  * version history
  * “Check for updates”
  * “Preview upgrade” → diff view
  * “Apply upgrade”

**3. Diff surfaces**

* Use the platform’s existing graph snapshot + diff concepts (even if v1 is “counts + changed record types list”).
* The UI/UX roadmap explicitly calls for template/package explorer with versioning + override indicators and install preview + diff flows.

**Acceptance criteria**

* Install v1 of a template package.
* Install v2 of the same template in catalog.
* Tenant can preview diff and apply upgrade; runtime app now reflects the new schema/UI config.

---

### Phase 3 — Close the authoring loop (Build → Preview → Install/Upgrade)

**Objective:** A tenant admin can create and evolve apps without feeling like they’re operating “raw platform internals.”

**1. “Create App” wizard**

* Entry: `/t/:tenantSlug/build/apps/new`
* Steps:

  1. choose template (catalog)
  2. configure (name, optional modules)
  3. preview (diff from empty tenant / current tenant)
  4. install
* This is the “template-driven application composition wizard” in the UI roadmap.

**2. “Modify App” UX**

* From app manage page:

  * “Propose change with AI” → creates Vibe Draft scoped to app
  * “Create Change (PR)” → creates Change record with targets prefilled
* The architecture reference already calls out the critical workflows you need to design: Change lifecycle and Vibe authoring flow; this phase makes them *productized* and app-scoped.

**3. Guardrails in UX**

* Every mutation routes through Change (or Vibe Draft → Change/Install path).
* Always show:

  * scope (“this affects Employee form layout”)
  * diff preview
  * reversible path (discard draft / rollback install)

This is directly aligned to the North Star: “scoped, grounded, diffable, reversible, tenant-specific.”

**Acceptance criteria**

* Admin can: Install app → click “Modify” → AI proposes variant → compare → adopt → preview → upgrade existing install.

---

### Phase 4 — Make it “enterprise-ready product” (minimum viable)

**Objective:** first taste of ServiceNow depth without losing Replit elegance.

**1. Role-aware navigation + shell polish**

* Left nav buckets: Apps / Build / Govern / Admin (only for Admin role)
* Environment ribbon + drift indicator (even read-only v1) per UI roadmap.

**2. Basic governance surfaces**

* Audit feed entry point (read-only)
* Change status badges everywhere
* Install/upgrade status badges

**Acceptance criteria**

* A viewer can live entirely inside Apps.
* An admin can live inside Build/Govern and confidently ship upgrades.

---

## Claude instructions (how to execute without breaking invariants)

Hard constraints to repeat at the top of every Claude session:

* **Stateless**: no sessions/cookies; identity via headers only (tenant + actor).
* **Tenant isolation**: tenant slug resolved server-side; all queries tenant-scoped; never trust client-provided tenant UUIDs.
* **Change as the mutation choke-point**: UI/UX edits and schema edits must stay diffable/auditable (even if the UI is “pretty”).
* **Apps are assemblies**: no bespoke “app logic”; apps reference primitives + engines + UI config + packages.

Implementation tactic (keeps momentum high):

* Build the **Apps runtime** first (Phase 1) using whatever record/forms infrastructure already exists, because that’s what creates “end-user accessible”.
* Then wire in install/upgrade visibility (Phase 2).
* Then make authoring feel like a single loop (Phase 3).
* Then polish/governance (Phase 4).

---

## What I need Claude to start with tomorrow (first task bundle)

1. Add `/apps` route group and an “App Launcher” page that lists installed packages/apps for the tenant.
2. Implement record list + detail views under an app (using compiled form renderer).
3. Add “Manage App” page stub with “Upgrade” placeholder (even if it’s disabled until Phase 2).

That sequence gets you from “platform works” → “a real user can do real work” fastest.

If you want, I can convert the phases above into a **Claude-ready execution prompt** (single paste) that includes exact file touchpoints (client routes/pages/api hooks) based on your repo layout, while keeping your “stateless multi-tenant control plane” guardrail intact.
