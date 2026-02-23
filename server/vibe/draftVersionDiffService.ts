import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import { projectPackageOntoSnapshot } from "../graph/installGraphService";
import { buildGraphSnapshot } from "../graph/graphRegistryService";
import { diffGraphSnapshots } from "../graph/graphDiffService";
import type { GraphDiffResult } from "../graph/graphDiffService";
import { getTenantStorage } from "../tenantStorage";
import { emitDomainEvent } from "../services/domainEventService";

export class DraftVersionDiffError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DraftVersionDiffError";
    this.statusCode = statusCode;
  }
}

export interface VersionDiffResult {
  diff: GraphDiffResult;
  summary: {
    addedRecordTypes: number;
    removedRecordTypes: number;
    modifiedRecordTypes: number;
  };
  fromVersion: number;
  toVersion: number;
}

/**
 * Diff two historical draft versions by projecting both packages
 * onto a shared graph snapshot.
 *
 * Read-only — works even on installed/discarded drafts.
 * Tenant-scoped via getTenantStorage.
 */
export async function diffDraftVersions(
  ctx: TenantContext,
  draftId: string,
  fromVersion: number,
  toVersion: number,
): Promise<VersionDiffResult> {
  const ts = getTenantStorage(ctx);

  // Load draft to get projectId (and validate tenant ownership)
  const draft = await ts.getVibeDraft(draftId);
  if (!draft) {
    throw new DraftVersionDiffError(`Draft "${draftId}" not found`, 404);
  }

  // Load both versions
  const versionA = await ts.getVibeDraftVersion(draftId, fromVersion);
  if (!versionA) {
    throw new DraftVersionDiffError(`Version ${fromVersion} not found for draft "${draftId}"`, 404);
  }

  const versionB = await ts.getVibeDraftVersion(draftId, toVersion);
  if (!versionB) {
    throw new DraftVersionDiffError(`Version ${toVersion} not found for draft "${draftId}"`, 404);
  }

  const pkgA = versionA.package as unknown as GraphPackage;
  const pkgB = versionB.package as unknown as GraphPackage;

  // Build shared snapshot and project both
  const snapshot = await buildGraphSnapshot(ctx);
  const projectedA = projectPackageOntoSnapshot(snapshot, pkgA, draft.projectId, ctx.tenantId);
  const projectedB = projectPackageOntoSnapshot(snapshot, pkgB, draft.projectId, ctx.tenantId);

  const diff = diffGraphSnapshots(projectedA, projectedB);

  emitDomainEvent(ctx, {
    type: "vibe.draft_version_diff_computed",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      fromVersion,
      toVersion,
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
    fromVersion,
    toVersion,
  };
}
