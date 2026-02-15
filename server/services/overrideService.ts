import type { TenantContext } from "../tenant";
import type { SystemContext } from "../systemContext";
import { storage } from "../storage";
import type {
  ModuleOverride,
  InsertModuleOverride,
} from "@shared/schema";

export class OverrideServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "OverrideServiceError";
    this.statusCode = statusCode;
  }
}

async function validateOverrideScope(
  tenantId: string,
  installedModuleId: string,
): Promise<{ installedModule: Awaited<ReturnType<typeof storage.getInstalledModule>>; installedApp: Awaited<ReturnType<typeof storage.getInstalledApp>> }> {
  const installedModule = await storage.getInstalledModule(installedModuleId);
  if (!installedModule) {
    throw new OverrideServiceError("Installed module not found", 404);
  }

  const installedApp = await storage.getInstalledApp(installedModule.installedAppId);
  if (!installedApp) {
    throw new OverrideServiceError("Installed app not found for module", 404);
  }

  if (installedApp.tenantId !== tenantId) {
    throw new OverrideServiceError("Override must belong to the same tenant as the installed module", 403);
  }

  if (installedApp.status !== "installed") {
    throw new OverrideServiceError("Cannot create overrides for apps that are not fully installed", 400);
  }

  return { installedModule, installedApp };
}

export async function createOverride(
  ctx: TenantContext,
  data: InsertModuleOverride,
): Promise<ModuleOverride> {
  await validateOverrideScope(ctx.tenantId, data.installedModuleId);

  if (data.tenantId !== ctx.tenantId) {
    throw new OverrideServiceError("Override tenantId must match request tenant context", 403);
  }

  const installedModule = await storage.getInstalledModule(data.installedModuleId);
  const mod = await storage.getModule(installedModule!.moduleId);
  if (!mod) {
    throw new OverrideServiceError("Underlying module not found", 404);
  }

  const project = await storage.getProject(mod.projectId);
  if (!project) {
    throw new OverrideServiceError("Project not found for module", 404);
  }

  const change = await storage.createChange({
    projectId: project.id,
    title: `Override: ${data.overrideType} on ${data.targetRef}`,
    description: `Module override (${data.overrideType}) targeting "${data.targetRef}"`,
    moduleId: mod.id,
    modulePath: mod.rootPath,
  });

  const override = await storage.createModuleOverride(data);
  await storage.updateModuleOverrideChangeId(override.id, change.id);

  const updated = await storage.getModuleOverride(override.id);
  return updated!;
}

export async function getOverridesByInstalledModule(
  ctx: TenantContext,
  installedModuleId: string,
): Promise<ModuleOverride[]> {
  await validateOverrideScope(ctx.tenantId, installedModuleId);
  return storage.getModuleOverridesByInstalledModule(installedModuleId);
}

export async function getOverridesByTenant(
  ctx: TenantContext,
): Promise<ModuleOverride[]> {
  return storage.getModuleOverridesByTenant(ctx.tenantId);
}

export async function getOverride(
  ctx: TenantContext,
  overrideId: string,
): Promise<ModuleOverride | undefined> {
  const override = await storage.getModuleOverride(overrideId);
  if (!override) return undefined;

  if (override.tenantId !== ctx.tenantId) {
    throw new OverrideServiceError("Override does not belong to this tenant", 403);
  }

  return override;
}

export async function activateOverride(
  ctx: TenantContext,
  overrideId: string,
): Promise<ModuleOverride> {
  const override = await storage.getModuleOverride(overrideId);
  if (!override) {
    throw new OverrideServiceError("Override not found", 404);
  }

  if (override.tenantId !== ctx.tenantId) {
    throw new OverrideServiceError("Override does not belong to this tenant", 403);
  }

  if (override.status !== "draft") {
    throw new OverrideServiceError(`Cannot activate override with status "${override.status}" — must be draft`, 400);
  }

  if (override.changeId) {
    const change = await storage.getChange(override.changeId);
    if (!change) {
      throw new OverrideServiceError("Linked change record not found", 400);
    }
    if (change.status !== "Ready" && change.status !== "Merged") {
      throw new OverrideServiceError(
        `Cannot activate override — linked change must be Ready or Merged, current status: "${change.status}"`,
        400,
      );
    }
  }

  const updated = await storage.updateModuleOverrideStatus(overrideId, "active");
  return updated!;
}

export async function retireOverride(
  ctx: TenantContext,
  overrideId: string,
): Promise<ModuleOverride> {
  const override = await storage.getModuleOverride(overrideId);
  if (!override) {
    throw new OverrideServiceError("Override not found", 404);
  }

  if (override.tenantId !== ctx.tenantId) {
    throw new OverrideServiceError("Override does not belong to this tenant", 403);
  }

  if (override.status === "retired") {
    return override;
  }

  const updated = await storage.updateModuleOverrideStatus(overrideId, "retired");
  return updated!;
}

export type ResolvedModuleConfig = {
  baseline: {
    templateModuleId: string;
    moduleName: string;
    moduleType: string;
    defaultCapabilityProfile: string;
    metadata: unknown;
  };
  installedConfig: {
    installedModuleId: string;
    capabilityProfile: string;
    isOverride: boolean;
  };
  activeOverrides: ModuleOverride[];
  composedPatch: Record<string, unknown>;
};

export async function resolveModuleConfig(
  ctx: TenantContext,
  installedModuleId: string,
): Promise<ResolvedModuleConfig> {
  const { installedModule } = await validateOverrideScope(ctx.tenantId, installedModuleId);

  const templateModule = await storage.getTemplateModule(installedModule!.templateModuleId);
  if (!templateModule) {
    throw new OverrideServiceError("Template module baseline not found", 404);
  }

  const activeOverrides = await storage.getActiveModuleOverrides(installedModuleId);

  const composedPatch: Record<string, unknown> = {};
  for (const override of activeOverrides) {
    const patch = override.patch as Record<string, unknown> | null;
    if (patch && typeof patch === "object") {
      Object.assign(composedPatch, patch);
    }
  }

  return {
    baseline: {
      templateModuleId: templateModule.id,
      moduleName: templateModule.moduleName,
      moduleType: templateModule.moduleType,
      defaultCapabilityProfile: templateModule.defaultCapabilityProfile,
      metadata: templateModule.metadata,
    },
    installedConfig: {
      installedModuleId: installedModule!.id,
      capabilityProfile: installedModule!.capabilityProfile,
      isOverride: installedModule!.isOverride,
    },
    activeOverrides,
    composedPatch,
  };
}

export async function inspectOverrides(
  _ctx: SystemContext,
  installedModuleId: string,
): Promise<ModuleOverride[]> {
  return storage.getModuleOverridesByInstalledModule(installedModuleId);
}
