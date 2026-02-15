import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import type { Module } from "@shared/schema";

export async function getModules(ctx: TenantContext): Promise<Module[]> {
  void ctx;
  return storage.getModules();
}

export async function getModulesByProject(ctx: TenantContext, projectId: string): Promise<Module[]> {
  void ctx;
  return storage.getModulesByProject(projectId);
}
