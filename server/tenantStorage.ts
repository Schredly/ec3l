import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  projects,
  changeRecords,
  modules,
  environments,
  type Project,
  type InsertProject,
  type ChangeRecord,
  type InsertChangeRecord,
  type Module,
  type InsertModule,
  type Environment,
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
  };
}
