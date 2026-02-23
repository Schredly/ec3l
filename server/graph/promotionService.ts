import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { EnvironmentPackageInstall } from "@shared/schema";
import { installGraphPackage, topologicalSortPackages } from "./installGraphService";
import type { GraphPackage, InstallResult } from "./installGraphService";
import { compareSemver } from "./installGraphService";
import { diffGraphSnapshots } from "./graphDiffService";
import type { GraphDiffResult } from "./graphDiffService";
import { buildGraphSnapshot } from "./graphRegistryService";
import { projectPackageOntoSnapshot } from "./installGraphService";
import { emitDomainEvent } from "../services/domainEventService";

// --- Types ---

export interface EnvironmentPackageState {
  packageKey: string;
  version: string;
  checksum: string;
  installedAt: Date;
  source: string;
}

export interface PackageDelta {
  packageKey: string;
  fromVersion: string | null;
  toVersion: string;
  fromChecksum: string | null;
  toChecksum: string;
  status: "missing" | "outdated" | "same";
}

export interface EnvironmentDiffResult {
  fromEnvironmentId: string;
  toEnvironmentId: string;
  deltas: PackageDelta[];
}

export interface PromotionResult {
  success: boolean;
  promoted: Array<{ packageKey: string; result: InstallResult }>;
  skipped: string[];
}

// --- Functions ---

/**
 * Get the latest installed version of each package in an environment.
 * Returns one entry per packageKey (the most recent install wins).
 */
export async function getEnvironmentPackageState(
  ctx: TenantContext,
  environmentId: string,
): Promise<EnvironmentPackageState[]> {
  const ts = getTenantStorage(ctx);
  const all = await ts.listEnvironmentPackageInstalls(environmentId);

  // Deduplicate: keep the latest install per packageKey (list is newest-first)
  const seen = new Map<string, EnvironmentPackageState>();
  for (const row of all) {
    if (!seen.has(row.packageKey)) {
      seen.set(row.packageKey, {
        packageKey: row.packageKey,
        version: row.version,
        checksum: row.checksum,
        installedAt: row.installedAt,
        source: row.source,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Compute the delta between two environments.
 * Shows packages that exist in `from` but are missing or outdated in `to`.
 */
export async function diffEnvironments(
  ctx: TenantContext,
  fromEnvironmentId: string,
  toEnvironmentId: string,
): Promise<EnvironmentDiffResult> {
  const fromState = await getEnvironmentPackageState(ctx, fromEnvironmentId);
  const toState = await getEnvironmentPackageState(ctx, toEnvironmentId);

  const toMap = new Map(toState.map((s) => [s.packageKey, s]));
  const deltas: PackageDelta[] = [];

  for (const fromPkg of fromState) {
    const toPkg = toMap.get(fromPkg.packageKey);

    if (!toPkg) {
      deltas.push({
        packageKey: fromPkg.packageKey,
        fromVersion: null,
        toVersion: fromPkg.version,
        fromChecksum: null,
        toChecksum: fromPkg.checksum,
        status: "missing",
      });
    } else if (toPkg.checksum !== fromPkg.checksum) {
      deltas.push({
        packageKey: fromPkg.packageKey,
        fromVersion: toPkg.version,
        toVersion: fromPkg.version,
        fromChecksum: toPkg.checksum,
        toChecksum: fromPkg.checksum,
        status: "outdated",
      });
    } else {
      deltas.push({
        packageKey: fromPkg.packageKey,
        fromVersion: toPkg.version,
        toVersion: fromPkg.version,
        fromChecksum: toPkg.checksum,
        toChecksum: fromPkg.checksum,
        status: "same",
      });
    }
  }

  return { fromEnvironmentId, toEnvironmentId, deltas };
}

/**
 * Promote packages from one environment to another.
 *
 * For each package that is missing or outdated in the target environment:
 * 1. Reconstruct the GraphPackage from the source environment's packageContents
 * 2. Install into the target project via installGraphPackage
 * 3. Record source="promote" in environment_package_installs
 *
 * Installs in dependency order (from packageContents.dependsOn).
 * Stops on first failure.
 */
export async function promoteEnvironmentPackages(
  ctx: TenantContext,
  fromEnvironmentId: string,
  toEnvironmentId: string,
  projectId: string,
  options?: { previewOnly?: boolean },
): Promise<PromotionResult> {
  const ts = getTenantStorage(ctx);
  const diff = await diffEnvironments(ctx, fromEnvironmentId, toEnvironmentId);

  // Filter to actionable deltas (missing or outdated)
  const actionable = diff.deltas.filter((d) => d.status !== "same");
  const skipped = diff.deltas
    .filter((d) => d.status === "same")
    .map((d) => d.packageKey);

  if (actionable.length === 0) {
    return { success: true, promoted: [], skipped };
  }

  // Fetch full package contents from source environment
  const fromInstalls = await ts.listEnvironmentPackageInstalls(fromEnvironmentId);
  const latestByKey = new Map<string, EnvironmentPackageInstall>();
  for (const row of fromInstalls) {
    if (!latestByKey.has(row.packageKey)) {
      latestByKey.set(row.packageKey, row);
    }
  }

  // Reconstruct GraphPackage objects for actionable deltas
  const packages: GraphPackage[] = [];
  for (const delta of actionable) {
    const install = latestByKey.get(delta.packageKey);
    if (!install) continue;

    const contents = install.packageContents as unknown as GraphPackage;
    packages.push(contents);
  }

  // Sort by dependency order
  const sorted = topologicalSortPackages(packages);

  if (options?.previewOnly) {
    // Preview mode: return what would be promoted without actually doing it
    const previewResults: Array<{ packageKey: string; result: InstallResult }> = [];
    for (const pkg of sorted) {
      const result = await installGraphPackage(ctx, projectId, pkg, {
        previewOnly: true,
        environmentId: toEnvironmentId,
      });
      previewResults.push({ packageKey: pkg.packageKey, result });
    }
    return { success: true, promoted: previewResults, skipped };
  }

  // Apply promotions
  const promoted: Array<{ packageKey: string; result: InstallResult }> = [];
  for (const pkg of sorted) {
    const result = await installGraphPackage(ctx, projectId, pkg, {
      previewOnly: false,
      allowDowngrade: false,
      environmentId: toEnvironmentId,
      source: "promote",
    });

    promoted.push({ packageKey: pkg.packageKey, result });

    if (!result.success) {
      return { success: false, promoted, skipped };
    }

    // Emit promotion event
    emitDomainEvent(ctx, {
      type: "graph.package_promoted",
      status: "completed",
      entityId: projectId,
      affectedRecords: {
        fromEnvironmentId,
        toEnvironmentId,
        packageKey: pkg.packageKey,
        version: pkg.version,
        checksum: result.checksum,
      } as unknown as Record<string, unknown>,
    });
  }

  return { success: true, promoted, skipped };
}
