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
- **Permissions**: form.view, form.edit, workflow.execute, workflow.approve, override.activate, change.approve.
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
- **Tenant Isolation**: All metadata is tenant-scoped; install requires valid tenant context; foreign key constraints prevent cross-tenant access.

## External Dependencies
- **GitHub**: For project connectivity and code repository management.
- **PostgreSQL**: The primary database for persistent storage.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.