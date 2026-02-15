import type { SystemContext } from "../systemContext";
import { storage } from "../storage";
import { db } from "../db";
import {
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

async function recordEvent(
  installedAppId: string,
  templateId: string,
  tenantId: string,
  eventType: "install_started" | "install_completed" | "install_failed",
  errorDetails?: string,
): Promise<void> {
  try {
    await storage.createInstalledAppEvent({
      installedAppId,
      templateId,
      tenantId,
      eventType,
      errorDetails: errorDetails ?? null,
    });
  } catch {
    // best-effort audit — never block install flow
  }
}

async function executeInstallTransaction(
  appId: string,
  tenantId: string,
  templateName: string,
  templateDomain: string,
  templateVersion: string,
  templateMods: Awaited<ReturnType<typeof storage.getTemplateModules>>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      name: `${templateName} (${templateDomain})`,
      githubRepo: `template/${templateName.toLowerCase().replace(/\s+/g, "-")}`,
      defaultBranch: "main",
      description: `Installed from template: ${templateName} v${templateVersion}`,
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
        installedAppId: appId,
        moduleId: mod.id,
        templateModuleId: tmpl.id,
        capabilityProfile: profile as InstalledModule["capabilityProfile"],
        isOverride: false,
      });
    }
  });
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

  if (existing && (existing.status === "failed" || existing.status === "upgrading")) {
    await storage.deleteInstalledModulesByApp(existing.id);
    await storage.updateInstalledAppStatus(existing.id, "upgrading");
    await recordEvent(existing.id, templateId, tenantId, "install_started");

    try {
      await executeInstallTransaction(
        existing.id, tenantId,
        template.name, template.domain, template.version,
        templateMods,
      );

      await storage.updateInstalledAppStatus(existing.id, "installed");
      await recordEvent(existing.id, templateId, tenantId, "install_completed");
      const updated = await storage.getInstalledApp(existing.id);
      return updated!;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await storage.updateInstalledAppStatus(existing.id, "failed");
      await recordEvent(existing.id, templateId, tenantId, "install_failed", errMsg);
      throw new InstallServiceError(
        `Installation failed for template "${template.name}" into tenant "${tenant.name}": ${errMsg}`,
        500,
      );
    }
  }

  let appRecord: InstalledApp;
  try {
    appRecord = await storage.createInstalledApp({
      tenantId,
      templateId,
      templateVersion: template.version,
    });
  } catch (err) {
    const retryExisting = await storage.getInstalledAppByTenantAndTemplate(tenantId, templateId);
    if (retryExisting && retryExisting.status === "installed") {
      return retryExisting;
    }
    throw new InstallServiceError(
      `Failed to create install record: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  await recordEvent(appRecord.id, templateId, tenantId, "install_started");

  try {
    await executeInstallTransaction(
      appRecord.id, tenantId,
      template.name, template.domain, template.version,
      templateMods,
    );

    await storage.updateInstalledAppStatus(appRecord.id, "installed");
    await recordEvent(appRecord.id, templateId, tenantId, "install_completed");
    const updated = await storage.getInstalledApp(appRecord.id);
    return updated!;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await storage.updateInstalledAppStatus(appRecord.id, "failed");
    await recordEvent(appRecord.id, templateId, tenantId, "install_failed", errMsg);
    throw new InstallServiceError(
      `Installation failed for template "${template.name}" into tenant "${tenant.name}": ${errMsg}`,
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
