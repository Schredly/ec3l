# ec3l.ai - ChangeOps Platform

## Overview
ec3l.ai is an agentic ChangeOps platform designed for managing code changes within GitHub-connected projects. It provides automated code modifications, change records with integrated status workflows, simulated workspaces for isolated development, and a robust agent skill system. The platform aims to streamline the development lifecycle by offering a structured and automated approach to code changes, enhancing efficiency and reliability.

## User Preferences
- Dark mode by default
- Inter font family, JetBrains Mono for code
- Blue-toned color scheme (primary: 217 91% 35%)

## System Architecture
The platform is built on a multi-tenant architecture, allowing separate ownership and data isolation for different tenants.

**Core Components:**
- **Frontend**: React, Vite, TypeScript, wouter, TanStack Query, shadcn/ui.
- **Backend**: Express.js REST API with a control plane and runner boundary.
- **Database**: PostgreSQL, managed with Drizzle ORM.
- **Styling**: Tailwind CSS with dark mode support.
- **Runner**: Isolated service for executing agent instructions.

**Data Model Highlights:**
- **Tenants**: Multi-tenant ownership.
- **Projects**: GitHub-connected repositories.
- **Modules**: Change-scoped units (code, schema, workflow, UI, integration) with versioning.
- **ChangeRecords**: Track code changes through a defined status workflow.
- **Workspaces**: Simulated isolated environments for changes.
- **AgentRuns**: Records of agent executions.
- **Templates**: Blueprints for creating tenant projects.
- **WorkflowDefinitions**: Tenant-scoped workflow definitions with trigger types.
- **RecordTypes**: Tenant-scoped data dictionary entries.
- **FormDefinitions**: Named form layouts per RecordType.

**Key Architectural Decisions:**
- **Override Composition**: Active overrides are deterministically ordered and applied sequentially with controlled deep merging and strict validation against template baselines.
- **Multi-Tenancy**: Tenant context is enforced via middleware on all API routes, with tenant-scoped storage and service functions.
- **Module Execution Context**: An explicit `ModuleExecutionContext` encapsulates tenant, module, and capability information for all execution paths.
- **Capability Profiles**: Named profiles define specific sets of capabilities for modules, enforced at runtime.
- **Agent Capability Model**: A canonical vocabulary of capabilities (e.g., `FS_READ`, `CMD_RUN`) with a "fail-closed" approach.
- **Module Boundary Enforcement**: Strict enforcement ensures file operations remain within a module's defined root path.
- **Form Required Invariant**: `FieldDefinition.isRequired` is absolute; behavior rules and overrides cannot set it to false.
- **Form Override Validation**: Overrides are validated at activation for field existence, placement, behavior rules, and required invariant.
- **Compiled Form Contract**: Compiled forms include per-field `effective` flags (required, readOnly, visible) computed from behavior rules.
- **Explicit Patch Operations**: Form override patches are built from explicit, typed operations (e.g., `moveField`, `changeSection`).
- **RBAC**: Tenant-scoped role-based access control enforces permissions at various points via a centralized `rbacService.ts` with a deny-before-allow policy and audit logging.
- **Workflow Engine**: Supports sequential execution of steps (assignment, approval, notification, decision) with fail-fast behavior and explicit decision branching. Integrates with Change lifecycle.
- **Workflow Triggers & Execution Intents**: `WorkflowTrigger` model for `record_event`, `schedule`, and `manual` trigger types. Triggers emit `WorkflowExecutionIntent`s, which are consumed by an intent dispatcher to execute workflows. All trigger operations enforce tenant isolation and require an `intentId` for execution.

## RBAC System (server/services/rbacService.ts)
- **Models**: RbacPermission (global), RbacRole (tenant-scoped), RbacRolePermission (role→permission), RbacUserRole (user→role), RbacPolicy (tenant-scoped, role→resourceType→effect), RbacAuditLog (authorization decision records).
- **Permissions**: form.view, form.edit, workflow.execute, workflow.approve, override.activate, change.approve, admin.view.
- **Policy scoping**: Policies scope permissions to resource types (form, workflow, override, change) with optional resourceId. Null resourceId = all resources of that type. Deny overrides allow.
- **Actor Identity**: authorize() requires explicit ActorIdentity with actorType (user | agent | system) and actorId (required for user/agent, null for system). Missing actor identity fails closed. Context mapping: UI requests → actorType=user, actorId=userId via actorFromContext(); agent actions → actorType=agent, actorId=agentId via agentActor(); SystemContext → actorType=system via systemActor() with RBAC bypass.
- **Audit Attribution**: Every authorize() call records an RbacAuditLog entry with actorType, actorId, permission, resourceType, resourceId, outcome (allow/deny), reason, and timestamp. GET /api/rbac/audit-logs (admin-only) retrieves audit history.
- **Evaluation**: authorize() resolves actor roles (active, tenant-scoped) → role permissions → policies. Fails closed if no explicit allow. SystemContext bypasses with audit record.
- **Enforcement points**: Form Studio save (form.edit), override activation (override.activate), workflow execution (workflow.execute), workflow resume/approval (workflow.approve), change checkin/merge/status-to-Ready/Merged (change.approve).
- **Seeding**: POST /api/rbac/seed-defaults seeds Admin/Editor/Viewer roles for the tenant. Permissions are seeded at application startup.
- **RBAC Admin Protection**: All mutating RBAC routes are gated by requireRbacAdmin() which checks change.approve permission (Admin-only). Read-only routes (GET permissions, GET roles) remain open. Disabled roles do not grant permissions (filtered in authorize()).
- **Bootstrap Exception**: POST /api/rbac/seed-defaults can be called without admin auth when no roles exist for the tenant (first-time setup). Once roles exist, it requires admin privileges.
- **API Routes**: GET/POST /api/rbac/permissions, GET/POST /api/rbac/roles, POST /api/rbac/roles/:id/disable, POST /api/rbac/roles/:id/enable, GET/POST /api/rbac/roles/:id/permissions, DELETE /api/rbac/roles/:id/permissions/:permissionId, GET/POST /api/rbac/users/:userId/roles, DELETE /api/rbac/users/:userId/roles/:roleId, GET/POST /api/rbac/policies, DELETE /api/rbac/policies/:id, POST /api/rbac/seed-defaults, GET /api/rbac/audit-logs.

## HR Lite Module (server/services/hrLiteInstaller.ts)
- **Module**: `hr_lite` (type: application, version: 1.0.0) — tenant-installable, versioned application module.
- **Installation**: POST /api/hr-lite/install — idempotent installer creates the module and all metadata for a tenant. Uses existing metadata systems (RecordTypes, FieldDefinitions, ChoiceLists) with no direct database tables.
- **RecordTypes**: `employee` (10 fields: employeeId, firstName, lastName, email, title, department, managerId, status, startDate, location) and `job_change` (8 fields: employeeId, changeType, effectiveDate, proposedTitle, proposedDepartment, proposedManagerId, reason, status).
- **ChoiceLists**: employee_status (candidate, active, leave, terminated), job_change_type (hire, promotion, transfer, termination), job_change_status (draft, pendingApproval, approved, rejected, applied).
- **FormDefinitions**: `employee_default` (3 sections: Identity, Role & Org, Employment Details) and `job_change_default` (3 sections: Change Details, Proposed Updates, Approval Status).
- **RBAC Roles**: HR Admin (full access), Manager (form.view + workflow.approve, scoped to job_change), Employee (form.view, scoped to employee form).
- **Workflows**: `hire_employee` workflow with record_event trigger (job_change where changeType=hire). Steps: (0) decision — validate employeeId, (1) approval — HR Admin, (2) approval — Manager, (3) record_mutation — update employee status to active with field mappings from job_change, (4) record_mutation — update job_change status to applied. `terminate_employee` workflow with record_event trigger (job_change where changeType=termination). Steps: (0) approval — HR Admin, (1) approval — Manager, (2) record_mutation — set employee status to terminated, (3) record_lock — lock employee record as read-only, (4) record_mutation — set job_change status to applied. Both workflows are created active with active triggers.
- **Workflow Step Types**: assignment, approval, notification, decision, record_mutation, record_lock. The `record_mutation` handler resolves mutations from static values and sourceMapping (input field → target field). The `record_lock` handler creates a metadata-level lock on a record, enforcing readOnly via the `record_locks` table.
- **Record Locks**: `record_locks` table tracks locked records by tenantId + recordTypeId + recordId (unique constraint). Lock enforcement via `checkRecordLock()` in formService rejects edits on locked records with 403. API: GET /api/record-locks (list locks), GET /api/record-locks/check?recordTypeId=X&recordId=Y (check lock status).
- **Tenant Isolation**: All metadata is tenant-scoped; install requires valid tenant context; foreign key constraints prevent cross-tenant access.

## Agent Proposal System (server/services/agentProposalService.ts, server/services/agentGuardService.ts)
- **Purpose**: Enable agent assistance for HR Lite (and other modules) in a propose-only, governed manner. Agents can draft proposals but cannot execute, activate, or mutate directly.
- **Agent Proposals Table**: `agent_proposals` with fields: id, tenantId, changeId, agentId, proposalType (form_patch | workflow_change | approval_comment), targetRef, payload (jsonb), summary, status (draft | submitted | accepted | rejected), createdAt.
- **Proposal Types**: `form_patch` (validated against formPatchOperationsSchema), `workflow_change` (suggested step modifications), `approval_comment` (draft comments/summaries).
- **Lifecycle**: Agent creates proposal (status=draft) → Human submits (status=submitted) → Human with change.approve reviews (status=accepted|rejected). Each proposal auto-creates a Draft ChangeRecord if no changeId provided.
- **Agent Guard** (`assertNotAgent`): Explicit denial of agent actors from: workflow execution, workflow resume/approval, override activation, change approval (Ready/Merged), trigger firing, proposal submission, proposal review. Uses `x-agent-id` header for agent identity resolution via `resolveActorFromContext()`.
- **Actor Resolution**: `resolveActorFromContext(ctx)` checks `x-agent-id` header first (returns agent actor), then `x-user-id` (returns user actor). TenantContext extended with optional `agentId` field.
- **Audit Trail**: Agent proposals create AgentRun records linked to the Change, recording proposalId, agentId, proposalType, and targetRef. RBAC audit logs capture agent authorization attempts with actorType=agent.
- **API Routes**: GET /api/agent-proposals (list by tenant, optional ?changeId filter), GET /api/agent-proposals/:id, POST /api/agent-proposals (create, agent-only), POST /api/agent-proposals/:id/submit (human-only), POST /api/agent-proposals/:id/review (human-only, requires change.approve).
- **Key Files**: server/services/agentProposalService.ts (proposal CRUD + validation), server/services/agentGuardService.ts (assertNotAgent guard), server/tenant.ts (agentId in TenantContext), server/services/rbacService.ts (resolveActorFromContext).

## External Dependencies
- **GitHub**: For project connectivity and code repository management.
- **PostgreSQL**: The primary database for persistent storage.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.