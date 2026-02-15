import type { SystemContext } from "../systemContext";
import { storage } from "../storage";
import { db } from "../db";
import {
  installedApps,
  installedModules,
  modules,
  projects,
  environments,
} from "@shared/schema";
import type { InstalledApp, Module, InstalledModule } from "@shared/schema";

export class InstallServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "InstallServiceError";
    this.statusCode = statusCode;
  }
}

export async function installTemplateIntoTenant(
  _ctx: SystemContext,
  tenantId: string,
  templateId: string,
): Promise<InstalledApp> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    throw new InstallServiceError(`Tenant "${tenantId}" not found`, 404);
  }

  const template = await storage.getTemplate(templateId);
  if (!template) {
    throw new InstallServiceError(`Template "${templateId}" not found`, 404);
  }

  const existing = await storage.getInstalledAppByTenantAndTemplate(tenantId, templateId);
  if (existing && existing.status === "installed") {
    return existing;
  }

  const templateMods = await storage.getTemplateModules(templateId);

  try {
    const result = await db.transaction(async (tx) => {
      const [installedApp] = await tx.insert(installedApps).values({
        tenantId,
        templateId,
        templateVersion: template.version,
      }).returning();

      const [project] = await tx.insert(projects).values({
        name: `${template.name} (${template.domain})`,
        githubRepo: `template/${template.name.toLowerCase().replace(/\s+/g, "-")}`,
        defaultBranch: "main",
        description: `Installed from template: ${template.name} v${template.version}`,
        tenantId,
      }).returning();

      await tx.insert(environments).values({ projectId: project.id, name: "dev", isDefault: true });
      await tx.insert(environments).values({ projectId: project.id, name: "test", isDefault: false });
      await tx.insert(environments).values({ projectId: project.id, name: "prod", isDefault: false });

      for (const tmpl of templateMods) {
        const profile = tmpl.defaultCapabilityProfile as Module["capabilityProfile"];

        const [mod] = await tx.insert(modules).values({
          projectId: project.id,
          name: tmpl.moduleName,
          type: tmpl.moduleType,
          rootPath: `src/${tmpl.moduleName}`,
          capabilityProfile: profile,
        }).returning();

        await tx.insert(installedModules).values({
          installedAppId: installedApp.id,
          moduleId: mod.id,
          templateModuleId: tmpl.id,
          capabilityProfile: profile as InstalledModule["capabilityProfile"],
          isOverride: false,
        });
      }

      return installedApp;
    });

    return result;
  } catch (err) {
    if (existing) {
      await storage.updateInstalledAppStatus(existing.id, "failed");
    } else {
      try {
        const failedApp = await storage.createInstalledApp({
          tenantId,
          templateId,
          templateVersion: template.version,
        });
        await storage.updateInstalledAppStatus(failedApp.id, "failed");
      } catch {
        // best-effort audit
      }
    }
    throw new InstallServiceError(
      `Installation failed for template "${template.name}" into tenant "${tenant.name}": ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
}

export async function getInstalledApps(
  _ctx: SystemContext,
  tenantId: string,
): Promise<InstalledApp[]> {
  return storage.getInstalledApps(tenantId);
}
