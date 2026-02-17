import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { Environment } from "@shared/schema";

export async function getEnvironmentsByProject(ctx: TenantContext, projectId: string): Promise<Environment[]> {
  const ts = getTenantStorage(ctx);
  return ts.getEnvironmentsByProject(projectId);
}

export async function getEnvironment(ctx: TenantContext, id: string): Promise<Environment | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getEnvironment(id);
}
