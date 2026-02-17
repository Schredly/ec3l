import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { Module } from "@shared/schema";

export async function getModules(ctx: TenantContext): Promise<Module[]> {
  const ts = getTenantStorage(ctx);
  return ts.getModules();
}

export async function getModulesByProject(ctx: TenantContext, projectId: string): Promise<Module[]> {
  const ts = getTenantStorage(ctx);
  return ts.getModulesByProject(projectId);
}
