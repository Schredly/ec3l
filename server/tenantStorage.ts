import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  projects,
  changeRecords,
  modules,
  environments,
  agentRuns,
  workspaces,
  type Project,
  type InsertProject,
  type ChangeRecord,
  type InsertChangeRecord,
  type Module,
  type InsertModule,
  type Environment,
  type InsertEnvironment,
  type AgentRun,
  type InsertAgentRun,
  type Workspace,
  type InsertWorkspace,
} from "@shared/schema";
import type { TenantContext } from "./tenant";

export function getTenantStorage(ctx: TenantContext) {
  const tenantId = ctx.tenantId;
  return {
    async getProjects(): Promise<Project[]> {
      return db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(projects.createdAt));
    },

    async getProject(id: string): Promise<Project | undefined> {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));
      return project;
    },

    async createProject(data: InsertProject): Promise<Project> {
      const [project] = await db
        .insert(projects)
        .values({ ...data, tenantId })
        .returning();
      return project;
    },

    async getChangesByProject(projectId: string): Promise<ChangeRecord[]> {
      const project = await this.getProject(projectId);
      if (!project) return [];
      return db
        .select()
        .from(changeRecords)
        .where(eq(changeRecords.projectId, projectId))
        .orderBy(desc(changeRecords.createdAt));
    },

    async getChanges(): Promise<ChangeRecord[]> {
      const rows = await db
        .select({ change: changeRecords })
        .from(changeRecords)
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(changeRecords.createdAt));
      return rows.map((r) => r.change);
    },

    async getChange(id: string): Promise<ChangeRecord | undefined> {
      const [row] = await db
        .select({ change: changeRecords })
        .from(changeRecords)
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(and(eq(changeRecords.id, id), eq(projects.tenantId, tenantId)));
      return row?.change;
    },

    async updateChangeStatus(
      id: string,
      status: ChangeRecord["status"],
      branchName?: string,
    ): Promise<ChangeRecord | undefined> {
      const existing = await this.getChange(id);
      if (!existing) return undefined;
      const updates: Partial<ChangeRecord> = { status };
      if (branchName !== undefined) {
        updates.branchName = branchName;
      }
      const [change] = await db
        .update(changeRecords)
        .set(updates)
        .where(eq(changeRecords.id, id))
        .returning();
      return change;
    },

    async createChange(data: InsertChangeRecord): Promise<ChangeRecord> {
      const [change] = await db
        .insert(changeRecords)
        .values(data)
        .returning();
      return change;
    },

    async getModule(id: string): Promise<Module | undefined> {
      const [row] = await db
        .select({ module: modules })
        .from(modules)
        .innerJoin(projects, eq(modules.projectId, projects.id))
        .where(and(eq(modules.id, id), eq(projects.tenantId, tenantId)));
      return row?.module;
    },

    async getModuleByProjectAndPath(
      projectId: string,
      rootPath: string,
    ): Promise<Module | undefined> {
      const project = await this.getProject(projectId);
      if (!project) return undefined;
      const [mod] = await db
        .select()
        .from(modules)
        .where(
          and(eq(modules.projectId, projectId), eq(modules.rootPath, rootPath)),
        );
      return mod;
    },

    async createModule(data: InsertModule): Promise<Module> {
      const [mod] = await db.insert(modules).values(data).returning();
      return mod;
    },

    async getDefaultEnvironment(
      projectId: string,
    ): Promise<Environment | undefined> {
      const project = await this.getProject(projectId);
      if (!project) return undefined;
      const [env] = await db
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.projectId, projectId),
            eq(environments.isDefault, true),
          ),
        );
      return env;
    },

    // --- Modules (tenant-scoped) ---

    async getModules(): Promise<Module[]> {
      const rows = await db
        .select({ module: modules })
        .from(modules)
        .innerJoin(projects, eq(modules.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(modules.createdAt));
      return rows.map((r) => r.module);
    },

    async getModulesByProject(projectId: string): Promise<Module[]> {
      const project = await this.getProject(projectId);
      if (!project) return [];
      return db
        .select()
        .from(modules)
        .where(eq(modules.projectId, projectId))
        .orderBy(desc(modules.createdAt));
    },

    // --- Environments (tenant-scoped) ---

    async getEnvironmentsByProject(projectId: string): Promise<Environment[]> {
      const project = await this.getProject(projectId);
      if (!project) return [];
      return db
        .select()
        .from(environments)
        .where(eq(environments.projectId, projectId));
    },

    async getEnvironment(id: string): Promise<Environment | undefined> {
      const [row] = await db
        .select({ environment: environments })
        .from(environments)
        .innerJoin(projects, eq(environments.projectId, projects.id))
        .where(and(eq(environments.id, id), eq(projects.tenantId, tenantId)));
      return row?.environment;
    },

    async createEnvironment(data: InsertEnvironment): Promise<Environment> {
      const [env] = await db.insert(environments).values(data).returning();
      return env;
    },

    // --- Agent Runs (tenant-scoped) ---

    async getAgentRuns(): Promise<AgentRun[]> {
      const rows = await db
        .select({ agentRun: agentRuns })
        .from(agentRuns)
        .innerJoin(changeRecords, eq(agentRuns.changeId, changeRecords.id))
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(agentRuns.createdAt));
      return rows.map((r) => r.agentRun);
    },

    async getAgentRunsByChange(changeId: string): Promise<AgentRun[]> {
      const change = await this.getChange(changeId);
      if (!change) return [];
      return db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.changeId, changeId))
        .orderBy(desc(agentRuns.createdAt));
    },

    async createAgentRun(data: InsertAgentRun): Promise<AgentRun> {
      const [run] = await db.insert(agentRuns).values(data).returning();
      return run;
    },

    async updateAgentRun(
      id: string,
      status: AgentRun["status"],
      skillsUsed?: string,
      logs?: string,
    ): Promise<AgentRun | undefined> {
      // Verify ownership via JOIN
      const [owned] = await db
        .select({ agentRun: agentRuns })
        .from(agentRuns)
        .innerJoin(changeRecords, eq(agentRuns.changeId, changeRecords.id))
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(and(eq(agentRuns.id, id), eq(projects.tenantId, tenantId)));
      if (!owned) return undefined;
      const updates: Partial<AgentRun> = { status };
      if (skillsUsed !== undefined) updates.skillsUsed = skillsUsed;
      if (logs !== undefined) updates.logs = logs;
      const [run] = await db
        .update(agentRuns)
        .set(updates)
        .where(eq(agentRuns.id, id))
        .returning();
      return run;
    },

    // --- Workspaces (tenant-scoped) ---

    async getWorkspaceByChange(changeId: string): Promise<Workspace | undefined> {
      const change = await this.getChange(changeId);
      if (!change) return undefined;
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.changeId, changeId))
        .orderBy(desc(workspaces.createdAt));
      return workspace;
    },

    async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
      const [workspace] = await db.insert(workspaces).values(data).returning();
      return workspace;
    },

    async updateWorkspaceStatus(
      id: string,
      status: Workspace["status"],
      containerId?: string,
      previewUrl?: string,
    ): Promise<Workspace | undefined> {
      // Verify ownership via JOIN
      const [owned] = await db
        .select({ workspace: workspaces })
        .from(workspaces)
        .innerJoin(changeRecords, eq(workspaces.changeId, changeRecords.id))
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(and(eq(workspaces.id, id), eq(projects.tenantId, tenantId)));
      if (!owned) return undefined;
      const updates: Partial<Workspace> = { status };
      if (containerId !== undefined) updates.containerId = containerId;
      if (previewUrl !== undefined) updates.previewUrl = previewUrl;
      const [workspace] = await db
        .update(workspaces)
        .set(updates)
        .where(eq(workspaces.id, id))
        .returning();
      return workspace;
    },
  };
}
