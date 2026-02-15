import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import { storage } from "../storage";
import type { Project, InsertProject } from "@shared/schema";

export async function getProjects(ctx: TenantContext): Promise<Project[]> {
  const ts = getTenantStorage(ctx);
  return ts.getProjects();
}

export async function getProject(ctx: TenantContext, id: string): Promise<Project | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getProject(id);
}

export async function createProject(
  ctx: TenantContext,
  input: Omit<InsertProject, "tenantId">
): Promise<Project> {
  const ts = getTenantStorage(ctx);
  const project = await ts.createProject(input as InsertProject);

  await storage.createModule({ projectId: project.id, name: "default", type: "code", rootPath: "src" });
  await storage.createEnvironment({ projectId: project.id, name: "dev", isDefault: true });
  await storage.createEnvironment({ projectId: project.id, name: "test", isDefault: false });
  await storage.createEnvironment({ projectId: project.id, name: "prod", isDefault: false });

  return project;
}
