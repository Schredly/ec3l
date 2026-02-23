import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import { projectPackageOntoSnapshot } from "../graph/installGraphService";
import { buildGraphSnapshot } from "../graph/graphRegistryService";
import { diffGraphSnapshots } from "../graph/graphDiffService";
import type { GraphDiffResult } from "../graph/graphDiffService";
import { emitDomainEvent } from "../services/domainEventService";

export interface VariantDiffResult {
  diff: GraphDiffResult;
  summary: {
    addedRecordTypes: number;
    removedRecordTypes: number;
    modifiedRecordTypes: number;
  };
}

/**
 * Diff two GraphPackages by projecting both onto a shared graph snapshot.
 *
 * Pure comparison — never mutates drafts, graph, or DB.
 * Both packages are projected onto the same base snapshot so the diff
 * shows what changed between them, not vs the current graph.
 */
export async function diffPackages(
  ctx: TenantContext,
  projectId: string,
  packageA: GraphPackage,
  packageB: GraphPackage,
): Promise<VariantDiffResult> {
  const snapshot = await buildGraphSnapshot(ctx);

  const projectedA = projectPackageOntoSnapshot(snapshot, packageA, projectId, ctx.tenantId);
  const projectedB = projectPackageOntoSnapshot(snapshot, packageB, projectId, ctx.tenantId);

  const diff = diffGraphSnapshots(projectedA, projectedB);

  emitDomainEvent(ctx, {
    type: "vibe.variant_diff_computed",
    status: "completed",
    entityId: "variant-diff",
    affectedRecords: {
      packageKeyA: packageA.packageKey,
      packageKeyB: packageB.packageKey,
      addedRecordTypes: diff.addedRecordTypes.length,
      removedRecordTypes: diff.removedRecordTypes.length,
      modifiedRecordTypes: diff.modifiedRecordTypes.length,
    },
  });

  return {
    diff,
    summary: {
      addedRecordTypes: diff.addedRecordTypes.length,
      removedRecordTypes: diff.removedRecordTypes.length,
      modifiedRecordTypes: diff.modifiedRecordTypes.length,
    },
  };
}
