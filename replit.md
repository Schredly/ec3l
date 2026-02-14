# ec3l.ai - ChangeOps Platform

## Overview
ec3l.ai is an agentic ChangeOps platform for managing code changes through GitHub-connected projects. It provides change records with status workflows, simulated workspaces, and an agent skill system for automated code modifications.

## Architecture
- **Frontend**: React + Vite + TypeScript with wouter routing, TanStack Query, shadcn/ui
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support

## Data Model
- **Projects**: GitHub-connected repositories with name, repo, default branch
- **ChangeRecords**: Track code changes with status workflow (Draft → WorkspaceRunning → Validating → Ready → Merged)
- **Workspaces**: Simulated isolated environments linked to changes
- **AgentRuns**: Agent execution records with intent, skills used, and logs

## Key Pages
- `/` - Dashboard with stats and recent activity
- `/projects` - Project list with create dialog
- `/projects/:id` - Project detail with change records
- `/changes` - All changes across projects
- `/changes/:id` - Change detail with workspace panel, agent runs, status pipeline
- `/skills` - Agent skill documentation (editFile, runCommand, runLint)
- `/runner` - Runner service endpoint documentation

## API Routes
- `GET/POST /api/projects` - List/create projects
- `GET /api/projects/:id` - Get project
- `GET /api/projects/:id/changes` - List changes for project
- `GET/POST /api/changes` - List/create changes
- `GET /api/changes/:id` - Get change
- `POST /api/changes/:id/start-workspace` - Start workspace
- `POST /api/changes/:id/checkin` - Check in change (→ Ready)
- `POST /api/changes/:id/merge` - Merge change
- `POST /api/changes/:id/agent-run` - Start agent run
- `GET /api/changes/:id/workspace` - Get workspace for change
- `GET /api/changes/:id/agent-runs` - Get agent runs for change
- `GET /api/agent-runs` - All agent runs

## User Preferences
- Dark mode by default
- Inter font family, JetBrains Mono for code
- Blue-toned color scheme (primary: 217 91% 35%)
