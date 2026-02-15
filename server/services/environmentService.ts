import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import type { Environment } from "@shared/schema";

export async function getEnvironmentsByProject(ctx: TenantContext, projectId: string): Promise<Environment[]> {
  void ctx;
  return storage.getEnvironmentsByProject(projectId);
}

export async function getEnvironment(ctx: TenantContext, id: string): Promise<Environment | undefined> {
  void ctx;
  return storage.getEnvironment(id);
}
