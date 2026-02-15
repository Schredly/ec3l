# ec3l.ai - ChangeOps Platform

## Overview
ec3l.ai is an agentic ChangeOps platform designed for managing code changes within GitHub-connected projects. It offers a comprehensive solution for automated code modifications, featuring change records with integrated status workflows, simulated workspaces for isolated development, and a robust agent skill system. The platform aims to streamline the development lifecycle by providing a structured and automated approach to code changes, enhancing efficiency and reliability.

## User Preferences
- Dark mode by default
- Inter font family, JetBrains Mono for code
- Blue-toned color scheme (primary: 217 91% 35%)

## System Architecture
The platform is built on a multi-tenant architecture, allowing separate ownership and data isolation for different tenants.

**Core Components:**
- **Frontend**: React, Vite, TypeScript, wouter, TanStack Query, shadcn/ui for a modern and responsive user interface.
- **Backend**: An Express.js REST API operating with a clear control plane and runner boundary.
- **Database**: PostgreSQL, managed with Drizzle ORM for efficient data handling.
- **Styling**: Tailwind CSS, providing a utility-first approach to styling with dark mode support.
- **Runner**: An isolated service interface designed to execute agent instructions and return logs/results.

**Data Model Highlights:**
- **Tenants**: Support for multi-tenant ownership.
- **Projects**: GitHub-connected repositories linked to tenants.
- **Modules**: First-class change-scoped units (code, schema, workflow, UI, integration) with versioning.
- **ChangeRecords**: Track code changes through a defined status workflow (Draft, WorkspaceRunning, Validating, Ready, Merged).
- **Environments**: Per-project environments (dev, test, prod).
- **Workspaces**: Simulated isolated environments for changes.
- **AgentRuns**: Records of agent executions, including intent and skills used.
- **Templates**: Read-only blueprints for creating tenant projects, supporting various domains.
- **InstalledApps**: Tracks template installations per tenant.
- **InstalledModules**: Links installed apps to created modules.
- **ModuleOverrides**: Tenant-scoped overrides for installed template modules, supporting workflow, form, rule, and config changes.
- **WorkflowDefinitions**: Tenant-scoped workflow definitions with various trigger types and statuses.
- **WorkflowExecutions**: Records of workflow execution.

**Key Architectural Decisions:**
- **Override Composition**: Active overrides are deterministically ordered and applied sequentially. Controlled deep merging is used for nested objects, with strict validation against template baselines to prevent destructive changes.
- **Multi-Tenancy**: Tenant context is enforced via middleware on all API routes, with tenant-scoped storage and service functions.
- **Module Execution Context**: An explicit `ModuleExecutionContext` is required for all execution paths, encapsulating tenant, module, and capability information.
- **Capability Profiles**: Named profiles (e.g., `CODE_MODULE_DEFAULT`, `READ_ONLY`) define specific sets of capabilities for modules, enforced at runtime.
- **SystemContext**: A specialized context for system-level operations, ensuring elevated privileges are explicitly managed and distinct from tenant contexts.
- **Agent Capability Model**: A canonical vocabulary of capabilities (e.g., `FS_READ`, `CMD_RUN`) is defined. A skill registry enforces required capabilities before skill execution, adopting a "fail-closed" approach where any missing capability results in denial.
- **Module Boundary Enforcement**: Strict enforcement ensures that all file operations remain within a module's defined root path, preventing unauthorized access or modifications outside the module's scope. Violations result in a `ModuleBoundaryViolationError` and fail the associated change.

## Workflow Engine (server/services/workflowEngine.ts & workflowService.ts)
- **ModuleExecutionContext enforcement**: Requires CMD_RUN capability via assertModuleCapability before execution.
- **Sequential execution**: Steps ordered by orderIndex ASC; each step output merged into input for subsequent steps as `step_{orderIndex}`.
- **Step handlers**: assignment (resolve assignee by type), approval (auto-approve or pause with awaiting_approval), notification (emit channel/recipient), decision (evaluate condition with equals/not_equals/truthy/falsy operators and explicit branch targets).
- **Fail-fast**: Step failure marks execution as failed; no remaining steps execute.
- **Approval pause/resume**: Non-auto-approved approval steps set step execution to `awaiting_approval`, execution to `paused` with `pausedAtStepId` and `accumulatedInput` persisted. Resume via `resumeWorkflowExecution(executionId, stepExecutionId, outcome)` validates tenant, context, paused state, and step match. Approved outcome continues at next step; rejected outcome fails the execution.
- **Explicit decision branching**: Decision steps require `onTrueStepIndex` and `onFalseStepIndex` in config — deterministic jump to specified orderIndex. No implicit fallthrough. Invalid branch configs rejected at activation time via `validateDecisionSteps()`.
- **Index-based execution loop**: Steps execute via while loop with array index that supports decision jumps. Decision output contains `targetStepIndex` used to jump to the corresponding step.
- **Change lifecycle integration**: Workflow definitions require linked Change to be Ready/Merged before activation (fail-closed).
- **Tenant isolation**: All CRUD and execution verifies tenant ownership.
- **SystemContext inspection**: systemInspectWorkflows() and systemInspectExecution() for platform-level read access.
- **API Routes**: GET/POST /api/workflow-definitions, POST /api/workflow-definitions/:id/activate, POST /api/workflow-definitions/:id/retire, GET/POST /api/workflow-definitions/:id/steps, POST /api/workflow-definitions/:id/execute, GET /api/workflow-executions, GET /api/workflow-executions/:id, GET /api/workflow-executions/:id/steps, POST /api/workflow-executions/:id/resume

## Workflow Triggers & Execution Intents (server/services/triggerService.ts, schedulerService.ts, intentDispatcher.ts)
- **WorkflowTrigger model**: id, tenantId, workflowDefinitionId, triggerType (record_event | schedule | manual), triggerConfig (json), status (active | disabled), createdAt.
- **WorkflowExecutionIntent model**: id, tenantId, workflowDefinitionId, triggerType, triggerPayload, status (pending | dispatched | failed), executionId, error, createdAt, dispatchedAt.
- **Trigger types**:
  - `record_event`: Matches on recordType + optional fieldConditions. Supported events: record.created, record.updated.
  - `schedule`: Config includes cron or interval (e.g., "5m", "1h"). Scheduler runs in control plane, polls every 60s, emits intents at fire time. Idempotent via lastCheckByTrigger map.
  - `manual`: Fired via API. Permission-gated, tenant-scoped, auditable.
- **Safety invariants**: Triggers cannot execute workflows directly — they emit execution intents. Intents are consumed by the intent dispatcher which executes workflows and links executionId. All trigger operations enforce tenant isolation.
- **Intent dispatcher**: Consumes pending intents, resolves module context, executes workflow via engine, updates intent status to dispatched (with executionId) or failed (with error).
- **Validation**: record_event requires triggerConfig.recordType, schedule requires cron or interval, manual triggers cannot be fired when disabled, non-manual triggers rejected from fire endpoint, unsupported events rejected.
- **API Routes**: GET/POST /api/workflow-triggers, GET /api/workflow-triggers/:id, POST /api/workflow-triggers/:id/disable, POST /api/workflow-triggers/:id/enable, POST /api/workflow-triggers/:id/fire, GET /api/workflow-definitions/:id/triggers, POST /api/record-events, GET /api/workflow-intents, GET /api/workflow-intents/:id, POST /api/workflow-intents/dispatch

## External Dependencies
- **GitHub**: For project connectivity and code repository management.
- **PostgreSQL**: The primary database for persistent storage.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.