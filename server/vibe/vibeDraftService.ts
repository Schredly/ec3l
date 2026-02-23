import type { TenantContext } from "../tenant";
import type { VibePackageDraft, VibePackageDraftVersion } from "@shared/schema";
import { getTenantStorage } from "../tenantStorage";
import { computePackageChecksum } from "../graph/installGraphService";
import type { GraphPackage } from "../graph/installGraphService";
import { applyPatchOpsToPackage, type DraftPatchOp } from "./draftPatchOps";
import { emitDomainEvent } from "../services/domainEventService";
import { generatePackageFromPrompt, refinePackageFromPrompt } from "./vibeService";
import { previewVibePackage, installVibePackage } from "./vibeService";

export class VibeDraftError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "VibeDraftError";
    this.statusCode = statusCode;
  }
}

/**
 * Create a version snapshot of the current draft state.
 * Monotonically increments version number per draft.
 */
async function createVersionSnapshot(
  ctx: TenantContext,
  draft: VibePackageDraft,
  reason: "create" | "refine" | "patch" | "restore" | "create_variant" | "adopt_variant",
): Promise<VibePackageDraftVersion> {
  const ts = getTenantStorage(ctx);
  const latestVersion = await ts.getLatestVibeDraftVersionNumber(draft.id);
  const versionNumber = latestVersion + 1;

  const version = await ts.createVibeDraftVersion({
    draftId: draft.id,
    versionNumber,
    createdBy: ctx.userId ?? ctx.agentId ?? null,
    reason,
    package: draft.package,
    checksum: draft.checksum,
    previewDiff: draft.lastPreviewDiff,
    previewErrors: draft.lastPreviewErrors,
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_version_created",
    status: "completed",
    entityId: draft.id,
    affectedRecords: {
      draftId: draft.id,
      versionNumber,
      reason,
      checksum: draft.checksum,
    },
  });

  return version;
}

/**
 * Create a new vibe draft from a natural-language prompt.
 * Generates a GraphPackage via template matching and persists it
 * as a draft row with server-generated ID.
 */
export async function createDraftFromPrompt(
  ctx: TenantContext,
  projectId: string,
  environmentId: string | null,
  prompt: string,
  appName?: string,
): Promise<VibePackageDraft> {
  const pkg = await generatePackageFromPrompt(prompt, appName, ctx);
  const checksum = computePackageChecksum(pkg);
  const ts = getTenantStorage(ctx);

  const draft = await ts.createVibeDraft({
    projectId,
    environmentId,
    prompt,
    package: pkg as unknown as Record<string, unknown>,
    checksum,
    createdBy: ctx.userId ?? ctx.agentId ?? null,
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_created",
    status: "completed",
    entityId: draft.id,
    affectedRecords: {
      draftId: draft.id,
      projectId,
      packageKey: pkg.packageKey,
      checksum,
    },
  });

  await createVersionSnapshot(ctx, draft, "create");

  return draft;
}

/**
 * Refine an existing draft by applying a refinement prompt.
 * Updates the package, checksum, and prompt in place.
 * Resets status to "draft" if previously previewed.
 */
export async function refineDraft(
  ctx: TenantContext,
  draftId: string,
  refinementPrompt: string,
): Promise<VibePackageDraft> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed" || draft.status === "discarded") {
    throw new VibeDraftError(`Draft "${draftId}" is ${draft.status} and cannot be refined`, 409);
  }

  const currentPkg = draft.package as unknown as GraphPackage;
  const refined = await refinePackageFromPrompt(currentPkg, refinementPrompt, ctx);
  const checksum = computePackageChecksum(refined);

  const updated = await ts.updateVibeDraft(draftId, {
    package: refined as unknown as Record<string, unknown>,
    checksum,
    prompt: refinementPrompt,
    status: "draft",
    updatedAt: new Date(),
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_refined",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      packageKey: refined.packageKey,
      checksum,
      refinementPrompt,
    },
  });

  await createVersionSnapshot(ctx, updated!, "refine");

  return updated!;
}

/**
 * Preview a draft by projecting it onto the graph snapshot.
 * Stores the diff and validation errors in the draft row
 * and transitions status to "previewed".
 */
export async function previewDraft(
  ctx: TenantContext,
  draftId: string,
): Promise<VibePackageDraft> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed" || draft.status === "discarded") {
    throw new VibeDraftError(`Draft "${draftId}" is ${draft.status} and cannot be previewed`, 409);
  }

  const pkg = draft.package as unknown as GraphPackage;
  const preview = await previewVibePackage(ctx, draft.projectId, pkg);

  const updated = await ts.updateVibeDraft(draftId, {
    status: "previewed",
    lastPreviewDiff: preview.diff as unknown as Record<string, unknown>,
    lastPreviewErrors: preview.validationErrors as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_previewed",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      packageKey: pkg.packageKey,
      valid: preview.valid,
      checksum: preview.checksum,
    },
  });

  return updated!;
}

/**
 * Install a draft by delegating to installVibePackage.
 * Transitions status to "installed". Terminal state.
 */
export async function installDraft(
  ctx: TenantContext,
  draftId: string,
): Promise<{ draft: VibePackageDraft; installResult: Awaited<ReturnType<typeof installVibePackage>> }> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed") {
    throw new VibeDraftError(`Draft "${draftId}" is already installed`, 409);
  }
  if (draft.status === "discarded") {
    throw new VibeDraftError(`Draft "${draftId}" is discarded and cannot be installed`, 409);
  }

  const pkg = draft.package as unknown as GraphPackage;
  const result = await installVibePackage(ctx, draft.projectId, pkg, {
    environmentId: draft.environmentId ?? undefined,
  });

  if (!result.installResult.success) {
    throw new VibeDraftError(
      `Install failed: ${result.installResult.validationErrors.map((e) => e.message).join("; ") || result.installResult.reason || "unknown error"}`,
    );
  }

  const updated = await ts.updateVibeDraft(draftId, {
    status: "installed",
    updatedAt: new Date(),
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_installed",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      packageKey: pkg.packageKey,
      version: pkg.version,
      checksum: result.installResult.checksum,
      environmentId: draft.environmentId,
    },
  });

  return { draft: updated!, installResult: result };
}

/**
 * Discard a draft. Transitions status to "discarded". Terminal state.
 * Allowed from any status except "installed".
 */
export async function discardDraft(
  ctx: TenantContext,
  draftId: string,
): Promise<VibePackageDraft> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed") {
    throw new VibeDraftError(`Draft "${draftId}" is installed and cannot be discarded`, 409);
  }
  if (draft.status === "discarded") {
    // Already discarded — idempotent
    return draft;
  }

  const updated = await ts.updateVibeDraft(draftId, {
    status: "discarded",
    updatedAt: new Date(),
  });

  const pkg = draft.package as unknown as GraphPackage;
  emitDomainEvent(ctx, {
    type: "vibe.draft_discarded",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      packageKey: pkg.packageKey,
      previousStatus: draft.status,
    },
  });

  return updated!;
}

/**
 * Apply structured patch ops to a draft package.
 * Resets status to "draft" (forces re-preview).
 */
export async function applyDraftPatchOps(
  ctx: TenantContext,
  draftId: string,
  ops: DraftPatchOp[],
): Promise<VibePackageDraft> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed" || draft.status === "discarded") {
    throw new VibeDraftError(`Draft "${draftId}" is ${draft.status} and cannot be patched`, 409);
  }

  const currentPkg = draft.package as unknown as GraphPackage;
  const newPkg = applyPatchOpsToPackage(currentPkg, ops);
  const checksum = computePackageChecksum(newPkg);

  const updated = await ts.updateVibeDraft(draftId, {
    package: newPkg as unknown as Record<string, unknown>,
    checksum,
    status: "draft",
    updatedAt: new Date(),
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_patched",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      opCount: ops.length,
    },
  });

  await createVersionSnapshot(ctx, updated!, "patch");

  return updated!;
}

/**
 * List version history for a draft, ordered newest-first.
 */
export async function listDraftVersions(
  ctx: TenantContext,
  draftId: string,
): Promise<VibePackageDraftVersion[]> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }

  return ts.listVibeDraftVersions(draftId);
}

/**
 * Restore a draft to a previous version.
 * Creates a new version snapshot (reason: "restore"), resets status to "draft".
 */
export async function restoreDraftVersion(
  ctx: TenantContext,
  draftId: string,
  versionNumber: number,
): Promise<VibePackageDraft> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed" || draft.status === "discarded") {
    throw new VibeDraftError(`Draft "${draftId}" is ${draft.status} and cannot be restored`, 409);
  }

  const version = await ts.getVibeDraftVersion(draftId, versionNumber);
  if (!version) {
    throw new VibeDraftError(`Version ${versionNumber} not found for draft "${draftId}"`, 404);
  }

  const updated = await ts.updateVibeDraft(draftId, {
    package: version.package as Record<string, unknown>,
    checksum: version.checksum,
    status: "draft",
    lastPreviewDiff: version.previewDiff as Record<string, unknown> | null,
    lastPreviewErrors: version.previewErrors as Record<string, unknown> | null,
    updatedAt: new Date(),
  });

  await createVersionSnapshot(ctx, updated!, "restore");

  emitDomainEvent(ctx, {
    type: "vibe.draft_restored",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      restoredVersionNumber: versionNumber,
      checksum: version.checksum,
    },
  });

  return updated!;
}

/**
 * Create a new draft from a pre-validated variant package.
 * Used after multi-variant generation — the package has already
 * been validated and previewed, so no LLM call is needed.
 */
export async function createDraftFromVariant(
  ctx: TenantContext,
  projectId: string,
  environmentId: string | null,
  pkg: GraphPackage,
  prompt: string,
): Promise<VibePackageDraft> {
  const checksum = computePackageChecksum(pkg);
  const ts = getTenantStorage(ctx);

  const draft = await ts.createVibeDraft({
    projectId,
    environmentId,
    prompt,
    package: pkg as unknown as Record<string, unknown>,
    checksum,
    createdBy: ctx.userId ?? ctx.agentId ?? null,
  });

  emitDomainEvent(ctx, {
    type: "vibe.draft_created_from_variant",
    status: "completed",
    entityId: draft.id,
    affectedRecords: {
      draftId: draft.id,
      projectId,
      packageKey: pkg.packageKey,
      checksum,
    },
  });

  await createVersionSnapshot(ctx, draft, "create_variant");

  return draft;
}

/**
 * Adopt a variant package into an existing draft.
 * Replaces the draft's package/checksum, resets status to "draft",
 * clears preview state, and creates a new version with reason "adopt_variant".
 */
export async function adoptVariant(
  ctx: TenantContext,
  draftId: string,
  pkg: GraphPackage,
  prompt?: string,
): Promise<VibePackageDraft> {
  const ts = getTenantStorage(ctx);
  const draft = await ts.getVibeDraft(draftId);

  if (!draft) {
    throw new VibeDraftError(`Draft "${draftId}" not found`, 404);
  }
  if (draft.status === "installed" || draft.status === "discarded") {
    throw new VibeDraftError(`Draft "${draftId}" is ${draft.status} and cannot adopt a variant`, 409);
  }

  const checksum = computePackageChecksum(pkg);

  const updateData: Record<string, unknown> = {
    package: pkg as unknown as Record<string, unknown>,
    checksum,
    status: "draft",
    lastPreviewDiff: null,
    lastPreviewErrors: null,
    updatedAt: new Date(),
  };
  if (prompt !== undefined) {
    updateData.prompt = prompt;
  }

  const updated = await ts.updateVibeDraft(draftId, updateData);

  emitDomainEvent(ctx, {
    type: "vibe.draft_variant_adopted",
    status: "completed",
    entityId: draftId,
    affectedRecords: {
      draftId,
      packageKey: pkg.packageKey,
      checksum,
      previousChecksum: draft.checksum,
    },
  });

  await createVersionSnapshot(ctx, updated!, "adopt_variant");

  return updated!;
}
