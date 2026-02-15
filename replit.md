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
- **Projects**: GitHub-connected repositories with optional tenantId FK
- **Modules**: First-class change-scoped units (code, schema, workflow, ui, integration) with rootPath and version
- **ChangeRecords**: Track code changes with status workflow (Draft → WorkspaceRunning → Validating → Ready → Merged), linked to Module and Environment
- **Environments**: Per-project environments (dev, test, prod) with isDefault flag
- **Workspaces**: Simulated isolated environments linked to changes
- **AgentRuns**: Agent execution records with intent, skills used, and logs
- **Templates**: Domain templates (HR, Finance, Legal, Facilities, Custom) — read-only structural groundwork
- **TemplateModules**: Join table linking templates to modules

## Key Pages
- `/` - Dashboard with stats and recent activity
- `/projects` - Project list with create dialog
- `/projects/:id` - Project detail with change records
- `/changes` - All changes across projects
- `/changes/:id` - Change detail with workspace panel, agent runs, status pipeline
- `/skills` - Agent skill documentation (editFile, runCommand, runLint)
- `/runner` - Runner service endpoint documentation

## API Routes
- `GET/POST /api/projects` - List/create projects (auto-creates default module + 3 environments)
- `GET /api/projects/:id` - Get project
- `GET /api/projects/:id/changes` - List changes for project
- `GET /api/projects/:id/modules` - List modules for project
- `GET /api/projects/:id/environments` - List environments for project
- `GET/POST /api/changes` - List/create changes (auto-resolves moduleId from modulePath, defaults environmentId to dev)
- `GET /api/changes/:id` - Get change
- `POST /api/changes/:id/start-workspace` - Start workspace (delegates to runner service)
- `POST /api/changes/:id/checkin` - Check in change (→ Ready)
- `POST /api/changes/:id/merge` - Merge change
- `POST /api/changes/:id/agent-run` - Start agent run
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
