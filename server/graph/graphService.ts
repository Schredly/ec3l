import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import { buildGraphSnapshot } from "./graphRegistryService";
import { validateGraphSnapshot } from "./graphValidationService";
import { buildProjectedSnapshot } from "./mergeGraphValidator";
import { diffGraphSnapshots } from "./graphDiffService";
import type { GraphDiffResult } from "./graphDiffService";
import type { GraphSnapshot, GraphValidationError } from "./graphContracts";

// Re-export install engine so it's available via ec3l.graph.*
export {
  installGraphPackage,
  installGraphPackages,
  topologicalSortPackages,
  computePackageChecksum,
  compareSemver,
  type GraphPackage,
  type GraphPackageDependency,
  type GraphPackageRecordType,
  type GraphPackageField,
  type GraphPackageSLAPolicy,
  type GraphPackageAssignmentRule,
  type GraphPackageWorkflow,
  type GraphPackageWorkflowStep,
  type InstallResult,
  type BatchInstallResult,
} from "./installGraphService";
import { projectPackageOntoSnapshot, installGraphPackages } from "./installGraphService";
import type { GraphPackage } from "./installGraphService";
import type { GraphPackageInstall } from "@shared/schema";

// Re-export promotion service
export {
  getEnvironmentPackageState,
  diffEnvironments,
  promoteEnvironmentPackages,
  type EnvironmentPackageState,
  type PackageDelta,
  type EnvironmentDiffResult,
  type PromotionResult,
} from "./promotionService";

// Re-export promotion intent service
export {
  PromotionIntentError,
  createPromotionIntent,
  previewPromotionIntent,
  approvePromotionIntent,
  executePromotionIntent,
  rejectPromotionIntent,
  listPromotionIntents,
} from "./promotionIntentService";

// --- Built-in package registry ---
import { hrLitePackage } from "./packages/hrLite";
import { itsmLitePackage } from "./packages/itsmLite";

const builtInPackages = new Map<string, GraphPackage>([
  [hrLitePackage.packageKey, hrLitePackage],
  [itsmLitePackage.packageKey, itsmLitePackage],
]);

export function getBuiltInPackage(packageKey: string): GraphPackage | undefined {
  return builtInPackages.get(packageKey);
}

export function listBuiltInPackages(): Array<{ packageKey: string; version: string }> {
  return Array.from(builtInPackages.values()).map((p) => ({
    packageKey: p.packageKey,
    version: p.version,
  }));
}

export interface GraphSnapshotSummary {
  tenantId: string;
  projectId: string;
  builtAt: string;
  counts: {
    recordTypes: number;
    fields: number;
    edges: number;
    workflows: number;
    slas: number;
    assignments: number;
  };
}

/**
 * Build a project-scoped graph snapshot.
 * Filters the tenant-wide snapshot to a single project.
 */
export async function getProjectGraphSnapshot(
  ctx: TenantContext,
  projectId: string,
): Promise<GraphSnapshot> {
  const full = await buildGraphSnapshot(ctx);

  const projectNodes = full.nodes.filter((n) => n.projectId === projectId);
  const projectKeys = new Set(projectNodes.map((n) => n.key));

  return {
    tenantId: full.tenantId,
    builtAt: full.builtAt,
    nodes: projectNodes,
    fields: full.fields.filter((f) => projectKeys.has(f.recordTypeKey)),
    edges: full.edges.filter(
      (e) => projectKeys.has(e.fromType) || projectKeys.has(e.toType),
    ),
    bindings: {
      workflows: full.bindings.workflows.filter((w) =>
        projectKeys.has(w.recordTypeKey),
      ),
      slas: full.bindings.slas.filter((s) => projectKeys.has(s.recordTypeKey)),
      assignments: full.bindings.assignments.filter((a) =>
        projectKeys.has(a.recordTypeKey),
      ),
      changePolicies: full.bindings.changePolicies.filter((c) =>
        projectKeys.has(c.recordTypeKey),
      ),
    },
  };
}

/**
 * Build a summary (counts only) of a project-scoped graph snapshot.
 */
export async function getProjectGraphSummary(
  ctx: TenantContext,
  projectId: string,
): Promise<GraphSnapshotSummary> {
  const snapshot = await getProjectGraphSnapshot(ctx, projectId);
  return {
    tenantId: snapshot.tenantId,
    projectId,
    builtAt: snapshot.builtAt,
    counts: {
      recordTypes: snapshot.nodes.length,
      fields: snapshot.fields.length,
      edges: snapshot.edges.length,
      workflows: snapshot.bindings.workflows.length,
      slas: snapshot.bindings.slas.length,
      assignments: snapshot.bindings.assignments.length,
    },
  };
}

/**
 * Run graph validation on a project-scoped snapshot without merge context.
 */
export async function validateProjectGraph(
  ctx: TenantContext,
  projectId: string,
): Promise<{ valid: boolean; errors: GraphValidationError[] }> {
  const snapshot = await getProjectGraphSnapshot(ctx, projectId);
  const errors = validateGraphSnapshot(snapshot);
  return { valid: errors.length === 0, errors };
}

/**
 * Compute a diff between the current graph and a projected graph
 * that would result from merging a change's patch ops.
 */
export async function getChangeDiff(
  ctx: TenantContext,
  projectId: string,
  changeId: string,
): Promise<GraphDiffResult> {
  const ts = getTenantStorage(ctx);

  const change = await ts.getChange(changeId);
  if (!change) {
    throw new Error(`Change "${changeId}" not found`);
  }
  if (change.projectId !== projectId) {
    throw new Error(
      `Change "${changeId}" does not belong to project "${projectId}"`,
    );
  }

  const ops = await ts.getChangePatchOpsByChange(changeId);
  const { current, projected } = await buildProjectedSnapshot(ctx, ops, projectId);
  return diffGraphSnapshots(current, projected);
}

/**
 * Get the install history for a package in a project.
 * Returns rows newest-first.
 */
export async function getPackageHistory(
  ctx: TenantContext,
  projectId: string,
  packageKey?: string,
): Promise<GraphPackageInstall[]> {
  const ts = getTenantStorage(ctx);
  const all = await ts.listGraphPackageInstalls(projectId);
  if (!packageKey) return all;
  return all.filter((row) => row.packageKey === packageKey);
}

/**
 * Diff two installed versions of a package by rebuilding projected snapshots
 * from stored package_contents and comparing via diffGraphSnapshots.
 */
export async function getVersionDiff(
  ctx: TenantContext,
  projectId: string,
  packageKey: string,
  fromVersion: string,
  toVersion: string,
): Promise<GraphDiffResult> {
  const ts = getTenantStorage(ctx);

  const fromInstall = await ts.getGraphPackageInstallByVersion(
    projectId,
    packageKey,
    fromVersion,
  );
  if (!fromInstall) {
    throw new Error(
      `No install found for package "${packageKey}" version "${fromVersion}" in project "${projectId}"`,
    );
  }

  const toInstall = await ts.getGraphPackageInstallByVersion(
    projectId,
    packageKey,
    toVersion,
  );
  if (!toInstall) {
    throw new Error(
      `No install found for package "${packageKey}" version "${toVersion}" in project "${projectId}"`,
    );
  }

  // Rebuild projected snapshots from stored package contents
  const current = await buildGraphSnapshot(ctx);

  const fromPkg = fromInstall.packageContents as unknown as {
    recordTypes: Array<{
      key: string;
      name?: string;
      baseType?: string;
      fields: Array<{ name: string; type: string; required?: boolean }>;
    }>;
  };
  const toPkg = toInstall.packageContents as unknown as {
    recordTypes: Array<{
      key: string;
      name?: string;
      baseType?: string;
      fields: Array<{ name: string; type: string; required?: boolean }>;
    }>;
  };

  const fromSnapshot = projectPackageOntoSnapshot(
    current,
    { packageKey, version: fromVersion, recordTypes: fromPkg.recordTypes },
    projectId,
    ctx.tenantId,
  );
  const toSnapshot = projectPackageOntoSnapshot(
    current,
    { packageKey, version: toVersion, recordTypes: toPkg.recordTypes },
    projectId,
    ctx.tenantId,
  );

  return diffGraphSnapshots(fromSnapshot, toSnapshot);
}
