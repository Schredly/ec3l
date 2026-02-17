import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangeRecord, InsertChangeRecord } from "@shared/schema";

export async function getChangesByProject(ctx: TenantContext, projectId: string): Promise<ChangeRecord[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangesByProject(projectId);
}

export async function getChanges(ctx: TenantContext): Promise<ChangeRecord[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChanges();
}

export async function getChange(ctx: TenantContext, id: string): Promise<ChangeRecord | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getChange(id);
}

export async function createChange(ctx: TenantContext, data: InsertChangeRecord): Promise<ChangeRecord> {
  const ts = getTenantStorage(ctx);
  const project = await ts.getProject(data.projectId);
  if (!project) {
    throw new ChangeServiceError("Project not found", 404);
  }

  const resolved = { ...data };

  if (resolved.moduleId) {
    const mod = await ts.getModule(resolved.moduleId);
    if (!mod) throw new ChangeServiceError("Module not found", 400);
    if (!resolved.modulePath) {
      resolved.modulePath = mod.rootPath;
    }
  } else if (resolved.modulePath) {
    let mod = await ts.getModuleByProjectAndPath(resolved.projectId, resolved.modulePath);
    if (!mod) {
      console.log(`[module-resolve] Auto-creating module for path "${resolved.modulePath}" in project ${resolved.projectId}`);
      const name = resolved.modulePath.split("/").pop() || "default";
      mod = await ts.createModule({
        projectId: resolved.projectId,
        name,
        type: "code",
        rootPath: resolved.modulePath,
      });
    } else {
      console.log(`[module-resolve] Resolved existing module "${mod.name}" (${mod.id}) for path "${resolved.modulePath}"`);
    }
    resolved.moduleId = mod.id;
  }

  if (!resolved.environmentId) {
    const defaultEnv = await ts.getDefaultEnvironment(resolved.projectId);
    if (defaultEnv) {
      resolved.environmentId = defaultEnv.id;
    }
  }

  return ts.createChange(resolved);
}

export async function updateChangeStatus(
  ctx: TenantContext,
  id: string,
  status: ChangeRecord["status"],
  branchName?: string
): Promise<ChangeRecord | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.updateChangeStatus(id, status, branchName);
}

export class ChangeServiceError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "ChangeServiceError";
  }
}
