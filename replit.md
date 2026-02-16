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
- **Multi-Tenancy**: Tenants, Projects (GitHub-connected), Modules (change-scoped units with versioning).
- **Change Management**: ChangeRecords (status workflow), Workspaces (simulated environments), AgentRuns (agent executions).
- **Configuration**: Templates (project blueprints), WorkflowDefinitions, RecordTypes, FormDefinitions.

**Key Architectural Decisions:**
- **Override Composition**: Active overrides are deterministically ordered and applied sequentially with controlled deep merging and strict validation against template baselines.
- **Multi-Tenancy**: Tenant context is enforced via middleware on all API routes, with tenant-scoped storage and service functions.
- **Module Execution Context**: An explicit `ModuleExecutionContext` encapsulates tenant, module, and capability information.
- **Capability Profiles & Agent Capability Model**: Named profiles define specific sets of capabilities for modules, enforced at runtime with a "fail-closed" approach (e.g., `FS_READ`, `CMD_RUN`).
- **Module Boundary Enforcement**: Strict enforcement ensures file operations remain within a module's defined root path.
- **Form System**: `FieldDefinition.isRequired` is absolute; overrides are validated at activation for field existence, placement, behavior rules, and required invariant. Compiled forms include per-field `effective` flags (required, readOnly, visible). Explicit patch operations for form overrides.
- **Role-Based Access Control (RBAC)**: Tenant-scoped RBAC with a deny-before-allow policy and audit logging, enforced via `rbacService.ts`. Supports permissions like `form.view`, `workflow.execute`, `change.approve`.
- **Workflow Engine**: Supports sequential execution of steps (assignment, approval, notification, decision) with fail-fast behavior and explicit decision branching. Integrates with Change lifecycle.
- **Workflow Triggers & Execution Intents**: `WorkflowTrigger` model for `record_event`, `schedule`, and `manual` trigger types. Triggers emit `WorkflowExecutionIntent`s for execution.
- **Agent Proposal System**: Agents can draft proposals (`form_patch`, `workflow_change`, `approval_comment`) but cannot execute, activate, or mutate directly. Human review is required. An `Agent Guard` (`assertNotAgent`) explicitly denies agent actors from critical mutations.
- **Runner Service Boundary**: The runner is extracted into a standalone `runner/` package (peer to `server/`), containing all execution logic: types, adapters (local/remote), boundary guard, boundary errors, telemetry emitter, runner service, and adapter factory. Shared execution context types (`TenantContext`, `ModuleExecutionContext`, `Capability`, `CapabilityProfileName`) live in `shared/executionTypes.ts` and are imported by both `runner/` and `server/`. The control plane (`server/`) communicates with the runner via in-process function calls through `server/execution/` which is now a thin shim re-exporting from `runner/`. The runner can be started independently via `initRunner({ telemetrySink })` — the control plane injects a `RunnerTelemetrySink` implementation backed by storage at startup in `server/index.ts`. No networking or containers are involved yet.
- **Runner Execution Interface**: Explicit control-plane → runner boundary for all execution paths, ensuring no filesystem or shell access exists outside the runner interface. Uses a configurable adapter pattern (LocalRunnerAdapter, RemoteRunnerAdapter stub) with standardized `ExecutionRequest` and `ExecutionResult` objects. Key files: `runner/types.ts`, `runner/adapters/localRunnerAdapter.ts`, `runner/adapters/remoteRunnerAdapter.ts`, `runner/adapterFactory.ts`.
- **Runner Boundary Hardening**: All adapter entry points run `validateRequestAtBoundary()` before execution. This validates: (1) tenantContext presence and validity, (2) moduleExecutionContext presence and validity, (3) tenant context immutability (top-level vs nested must match), (4) capability checks (requested caps must be subset of granted). Module boundary path validation via `validateModuleBoundaryPath()` rejects absolute paths, path traversal, and scope escapes. Typed error classes: `MissingTenantContextError`, `MissingModuleContextError`, `CapabilityNotGrantedError`, `ModuleBoundaryEscapeError`, `TenantContextMutationError`. Runner returns `ExecutionResult` only — control plane applies state changes after validation. Key files: `runner/boundaryGuard.ts`, `runner/boundaryErrors.ts`, `server/execution/__tests__/boundaryGuard.test.ts` (32 tests).
- **Structured Execution Telemetry**: Append-only `execution_telemetry_events` table with 3 event types (execution_started, execution_completed, execution_failed). Rich metadata: tenantId, moduleId, executionType (workflow_step/task/agent_action), workflowId/stepId, executionId, actorType/actorId, status, errorCode/errorMessage. Telemetry emitter (`runner/telemetry.ts`) uses an injected `RunnerTelemetrySink` interface — the control plane provides the storage-backed implementation at init. Emission failures are logged but never block execution. Wired into both LocalRunnerAdapter and RemoteRunnerAdapter. Queryable via `GET /api/admin/execution-telemetry?from=&to=&limit=` (tenant-scoped, RBAC-gated).

## External Dependencies
- **GitHub**: For project connectivity and code repository management.
- **PostgreSQL**: The primary database for persistent storage.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.