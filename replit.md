# ec3l.ai - ChangeOps Platform

## Overview
ec3l.ai is an agentic ChangeOps platform for managing code changes through GitHub-connected projects. It provides change records with status workflows, simulated workspaces, and an agent skill system for automated code modifications.

## Architecture
- **Frontend**: React + Vite + TypeScript with wouter routing, TanStack Query, shadcn/ui
- **Backend**: Express.js REST API with control plane / runner boundary
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support
- **Runner**: Isolated runner service interface (server/runner.ts) — receives explicit instructions, returns logs/results. Currently simulated.

## Data Model
- **Tenants**: Multi-tenant ownership (id, name, slug, plan)
- **Projects**: GitHub-connected repositories with required tenantId FK (NOT NULL)
- **Modules**: First-class change-scoped units (code, schema, workflow, ui, integration) with rootPath and version
- **ChangeRecords**: Track code changes with status workflow (Draft -> WorkspaceRunning -> Validating -> Ready -> Merged), linked to Module and Environment
- **Environments**: Per-project environments (dev, test, prod) with isDefault flag
- **Workspaces**: Simulated isolated environments linked to changes
- **AgentRuns**: Agent execution records with intent, skills used, and logs
- **Templates**: Domain templates (HR, Finance, Legal, Facilities, Custom) -- read-only structural groundwork
- **TemplateModules**: Join table linking templates to modules

## Multi-Tenancy Architecture
- **Tenant Resolution** (server/tenant.ts): Defines TenantContext type, SystemContext type, TenantResolutionError, and resolveTenantContext() function that reads x-tenant-id header.
- **Tenant Middleware** (server/middleware/tenant.ts): Enforces tenant context on all /api routes (returns 401 if missing). Attaches req.tenantContext with tenantId and source.
- **Tenant Storage** (server/tenantStorage.ts): getTenantStorage(ctx: TenantContext) returns tenant-scoped methods for getProjects(), getProject(), createProject(), getChangesByProject(). Accepts TenantContext (not raw tenantId).
- **Tenant Bootstrap** (client/src/hooks/use-tenant.ts): Frontend auto-fetches /api/tenants on first load and stores tenantId in localStorage. All API calls include x-tenant-id header via queryClient.
- **Default Tenant**: Seed ensures a "default" tenant (slug: "default") always exists.
- **Tenant-Scoped Routes**: All /api routes pass TenantContext through service functions. No route handler accesses tenant-owned data directly via storage.
- **Service Layer** (server/services/): Every service function requires TenantContext as first argument, enforced at compile time. Route handlers delegate to services with no direct DB access.
  - projectService.ts: getProjects(), getProject(), createProject()
  - changeService.ts: getChanges(), getChange(), getChangesByProject(), createChange(), updateChangeStatus()
  - workspaceService.ts: getWorkspaceByChange(), startWorkspace(), stopWorkspace()
  - agentRunService.ts: getAgentRuns(), getAgentRunsByChange(), createAgentRun()
  - moduleService.ts: getModules(), getModulesByProject()
  - environmentService.ts: getEnvironmentsByProject(), getEnvironment()
  - templateService.ts: systemGetTemplates(), systemGetTemplate(), systemGetTemplateModules() — require SystemContext (not tenant-owned data)

## Module Execution Context
- **ModuleExecutionContext** (server/moduleContext.ts): Explicit context type required for all execution paths. Contains tenantContext, moduleId, moduleRootPath, capabilityProfile, and derived capabilities.
- **buildModuleExecutionContext()** (server/moduleContext.ts): Factory that constructs context from tenant context + module metadata; resolves capabilities from module's assigned profile via resolveProfile().
- **ModuleContextError** (server/moduleContext.ts): Error class for missing module execution context.
- **Required by**: All runner execution functions (startWorkspace, runCommand, getDiff, getLogs, validateFilePath), enforceModuleBoundary, agentRunService.createAgentRun, workspaceService.startWorkspace.
- **Constructed in**: Route handlers (start-workspace, agent-run) call buildModuleExecutionContext() with tenant context and module record.
- **Compile-time enforcement**: Calling execution functions without ModuleExecutionContext fails at compile time.

## Capability Profiles
- **Profile definitions** (server/capabilityProfiles.ts): Named profiles mapping to specific capability sets:
  - `CODE_MODULE_DEFAULT`: [FS_READ, FS_WRITE, CMD_RUN, GIT_DIFF] — standard code modules
  - `WORKFLOW_MODULE_DEFAULT`: [FS_READ, CMD_RUN, GIT_DIFF] — workflow modules (no write)
  - `READ_ONLY`: [FS_READ, GIT_DIFF] — read-only inspection modules
  - `SYSTEM_PRIVILEGED`: [FS_READ, FS_WRITE, CMD_RUN, GIT_DIFF, NET_HTTP] — platform operations only
- **resolveProfile()** (server/capabilityProfiles.ts): Maps profile name to capability set; throws on unknown profiles (fail-closed).
- **Schema column**: `capabilityProfile` enum on modules table with default `CODE_MODULE_DEFAULT`. Stored at module level, resolved at runtime.
- **Module creation**: New modules receive profile based on type; defaults to CODE_MODULE_DEFAULT.

## SystemContext
- **SystemContext** (server/systemContext.ts): Branded type using unique symbol to prevent accidental creation. Always uses SYSTEM_PRIVILEGED profile.
- **createSystemContext()** (server/systemContext.ts): Factory function — only way to create SystemContext. Returns branded object with source "system" and SYSTEM_PRIVILEGED capabilities.
- **isSystemContext()** (server/systemContext.ts): Type guard for runtime context discrimination.
- **Used by**: templateService for read-only platform data access (templates are not tenant-owned).

## Agent Capability Model
- **Canonical vocabulary** (server/capabilities.ts): Defines Capability type and Capabilities const (FS_READ, FS_WRITE, CMD_RUN, GIT_DIFF, NET_HTTP). No union types — system and module paths are unambiguous by type.
- **assertModuleCapability()** (server/capabilities.ts): Requires ModuleExecutionContext explicitly. Used by skill registry for module-scoped agent execution.
- **assertSystemCapability()** (server/capabilities.ts): Requires SystemContext explicitly. Available for system-level operations.
- **checkCapability()** (server/capabilities.ts): Pure private helper accepting capabilities array — shared logic with no execution context dependency.
- **CapabilityDeniedError** (server/capabilities.ts): Typed error with capability field. Thrown on denial.
- **Skill Registry** (server/skills/registry.ts): Central registry where each skill declares name, requiredCapabilities, and execute(). Skills can only be invoked via skillRegistry.invoke(name, ctx, input) which asserts all requiredCapabilities before execution. runnerService is private to registry — no direct imports by agent logic.
- **controlPlane** (server/skills/registry.ts): Narrow exported interface for non-agent workspace lifecycle operations (startWorkspace, stopWorkspace).
- **Registered skills**: editFile (fs:read, fs:write), runCommand (cmd:run), runLint (fs:read, cmd:run), getDiff (git:diff).
- **Enforcement flow**: agentRunService.createAgentRun invokes skills via registry. On CapabilityDeniedError: agent run fails with failureReason "CAPABILITY_DENIED", structured denial artifact records contextType and capabilityProfile. Route handler also catches CapabilityDeniedError and returns 403.
- **Fail-closed**: Any missing capability causes immediate denial — no fallback or soft-return.

## Module Boundary Enforcement
- **ModuleBoundaryViolationError** (server/moduleContext.ts): Typed error with moduleId, attemptedPath, reason. Thrown on all boundary violations — never downgraded to warning.
- **enforceModuleBoundary()** (server/runner.ts): Accepts ModuleExecutionContext, validates that requested paths stay within module rootPath. Denies absolute paths, ".." traversal, and out-of-scope resolution. Throws ModuleBoundaryViolationError (fail-closed).
- **runCommand()**: Calls enforceModuleBoundary and lets violations propagate (no catch/soft-return).
- **validateFilePath()**: Delegates to enforceModuleBoundary, returns {valid, reason} for non-throwing checks.
- **Orchestration boundary** (agentRunService.createAgentRun): Catches ModuleBoundaryViolationError, marks AgentRun as Failed, marks Change as ValidationFailed, captures structured violation artifact in logs.
- **Terminal state**: ValidationFailed changes cannot be promoted (checkin, merge), retried (agent-run), or restarted (start-workspace). All return 403 with failureReason "MODULE_BOUNDARY_VIOLATION". A new Change is required.

## Key Pages
- `/` - Dashboard with stats and recent activity
- `/projects` - Project list with create dialog
- `/projects/:id` - Project detail with change records
- `/changes` - All changes across projects
- `/changes/:id` - Change detail with workspace panel, agent runs, status pipeline
- `/skills` - Agent skill documentation (editFile, runCommand, runLint)
- `/runner` - Runner service endpoint documentation

## API Routes
- `GET /api/tenants` - List all tenants (no auth required, used for bootstrapping)
- `GET/POST /api/projects` - List/create projects (tenant-scoped, auto-creates default module + 3 environments)
- `GET /api/projects/:id` - Get project (tenant-scoped)
- `GET /api/projects/:id/changes` - List changes for project (tenant-scoped)
- `GET /api/projects/:id/modules` - List modules for project
- `GET /api/projects/:id/environments` - List environments for project
- `GET/POST /api/changes` - List/create changes (POST is tenant-safe: verifies project ownership)
- `GET /api/changes/:id` - Get change
- `POST /api/changes/:id/start-workspace` - Start workspace (delegates to runner service)
- `POST /api/changes/:id/checkin` - Check in change (-> Ready)
- `POST /api/changes/:id/merge` - Merge change
- `POST /api/changes/:id/agent-run` - Start agent run (module-scoped permissions enforced)
- `GET /api/changes/:id/workspace` - Get workspace for change
- `GET /api/changes/:id/agent-runs` - Get agent runs for change
- `GET /api/agent-runs` - All agent runs
- `GET /api/modules` - All modules
- `GET /api/environments/:id` - Get environment
- `GET /api/templates` - All templates (read-only)
- `GET /api/templates/:id` - Get template
- `GET /api/templates/:id/modules` - Get template modules

## User Preferences
- Dark mode by default
- Inter font family, JetBrains Mono for code
- Blue-toned color scheme (primary: 217 91% 35%)
