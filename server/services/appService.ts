import { storage } from "../storage";
import { getTenantStorage } from "../tenantStorage";
import type { TenantContext } from "../tenant";
import { installGraphPackage, getBuiltInPackage, listBuiltInPackages, compareSemver } from "../graph/graphService";
import { emitDomainEvent } from "./domainEventService";

export class AppServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AppServiceError";
    this.statusCode = statusCode;
  }
}

export interface AppSummary {
  id: string;
  appKey: string;
  displayName: string;
  installedVersion: string;
  status: string;
}

export interface AppDetail extends AppSummary {
  recordTypes: { key: string; name: string; id: string }[];
  availableVersions: string[];
}

export interface UpgradeResult {
  previousVersion: string;
  newVersion: string;
  status: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolve installed app + project info for an appKey */
async function resolveApp(ctx: TenantContext, appKey: string) {
  const apps = await storage.getInstalledApps(ctx.tenantId);

  for (const app of apps) {
    const template = await storage.getTemplate(app.templateId);
    if (!template) continue;

    if (slugify(template.name) === appKey) {
      const ts = getTenantStorage(ctx);
      const installedModules = await storage.getInstalledModules(app.id);
      const projectIds = new Set<string>();
      for (const im of installedModules) {
        const mod = await ts.getModule(im.moduleId);
        if (mod) projectIds.add(mod.projectId);
      }
      return { app, template, projectIds };
    }
  }

  return undefined;
}

export async function listApps(ctx: TenantContext): Promise<AppSummary[]> {
  const apps = await storage.getInstalledApps(ctx.tenantId);

  const summaries: AppSummary[] = [];
  for (const app of apps) {
    const template = await storage.getTemplate(app.templateId);
    if (!template) continue;

    summaries.push({
      id: app.id,
      appKey: slugify(template.name),
      displayName: template.name,
      installedVersion: app.templateVersion,
      status: app.status,
    });
  }

  return summaries;
}

export async function getAppByKey(ctx: TenantContext, appKey: string): Promise<AppDetail | undefined> {
  const resolved = await resolveApp(ctx, appKey);
  if (!resolved) return undefined;

  const { app, template, projectIds } = resolved;
  const ts = getTenantStorage(ctx);
  const allRecordTypes = await ts.listRecordTypes();

  const appRecordTypes = allRecordTypes
    .filter((rt) => projectIds.has(rt.projectId))
    .map((rt) => ({ key: rt.key, name: rt.name, id: rt.id }));

  // Check for available newer versions from built-in packages
  const builtInPackages = listBuiltInPackages();
  const availableVersions: string[] = [];
  for (const pkg of builtInPackages) {
    // Match by checking if the package key relates to this template
    // Built-in packages use packageKey like "hr.lite", templates use name like "HR Lite"
    if (slugify(pkg.packageKey.replace(/\./g, " ")) === appKey || slugify(pkg.packageKey) === appKey) {
      if (compareSemver(pkg.version, app.templateVersion) > 0) {
        availableVersions.push(pkg.version);
      }
    }
  }

  return {
    id: app.id,
    appKey,
    displayName: template.name,
    installedVersion: app.templateVersion,
    status: app.status,
    recordTypes: appRecordTypes,
    availableVersions,
  };
}

export async function upgradeApp(
  ctx: TenantContext,
  appKey: string,
  targetVersion: string,
): Promise<UpgradeResult> {
  const resolved = await resolveApp(ctx, appKey);
  if (!resolved) {
    throw new AppServiceError("App not found", 404);
  }

  const { app, template, projectIds } = resolved;
  const previousVersion = app.templateVersion;

  if (compareSemver(targetVersion, previousVersion) <= 0) {
    throw new AppServiceError(
      `Target version "${targetVersion}" must be newer than current "${previousVersion}"`,
    );
  }

  // Find the built-in package for upgrade
  const builtInPackages = listBuiltInPackages();
  let matchingPackageKey: string | undefined;
  for (const pkg of builtInPackages) {
    if (slugify(pkg.packageKey.replace(/\./g, " ")) === appKey || slugify(pkg.packageKey) === appKey) {
      matchingPackageKey = pkg.packageKey;
      break;
    }
  }

  if (!matchingPackageKey) {
    throw new AppServiceError("No package found for this app");
  }

  const graphPackage = getBuiltInPackage(matchingPackageKey);
  if (!graphPackage) {
    throw new AppServiceError("Package not found in registry");
  }

  // Find the project to install into
  const projectId = projectIds.values().next().value;
  if (!projectId) {
    throw new AppServiceError("No project associated with this app");
  }

  const result = await installGraphPackage(ctx, projectId, graphPackage);

  if (!result.success) {
    throw new AppServiceError(
      result.reason || "Upgrade failed",
      422,
    );
  }

  // Update the installed app version
  await storage.updateInstalledAppStatus(app.id, "installed");

  emitDomainEvent(ctx, {
    type: "app.upgraded",
    status: "completed",
    entityId: app.id,
    affectedRecords: {
      appKey,
      previousVersion,
      newVersion: targetVersion,
    },
  });

  return {
    previousVersion,
    newVersion: targetVersion,
    status: "upgraded",
  };
}
