import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  projects,
  changeRecords,
  type Project,
  type InsertProject,
  type ChangeRecord,
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
  };
}
