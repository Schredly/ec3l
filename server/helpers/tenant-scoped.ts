import { eq, desc, and, type SQL } from "drizzle-orm";
import { db } from "../db";
import { projects, type Project } from "@shared/schema";

export class TenantScopedQueries {
  constructor(private tenantId: string | null | undefined) {}

  async getProjects(): Promise<Project[]> {
    if (this.tenantId) {
      return db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, this.tenantId))
        .orderBy(desc(projects.createdAt));
    }

    console.warn(`[tenant-scope] Unscoped project listing — no tenantId provided`);
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const conditions: SQL[] = [eq(projects.id, id)];
    if (this.tenantId) {
      conditions.push(eq(projects.tenantId, this.tenantId));
    } else {
      console.warn(`[tenant-scope] Unscoped project access for id=${id} — no tenantId provided`);
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(...conditions));
    return project;
  }
}

export function tenantScoped(tenantId: string | null | undefined) {
  return new TenantScopedQueries(tenantId);
}
