import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import { computePackageChecksum } from "../graph/installGraphService";
import { buildGraphSnapshot } from "../graph/graphRegistryService";
import { projectPackageOntoSnapshot } from "../graph/installGraphService";
import { validateGraphSnapshot } from "../graph/graphValidationService";
import { diffGraphSnapshots } from "../graph/graphDiffService";
import type { GraphDiffResult } from "../graph/graphDiffService";
import type { GraphValidationError } from "../graph/graphContracts";
import { validateGraphPackage } from "./graphPackageSchema";
import { createLlmAdapter } from "./llmAdapter";
import { emitDomainEvent } from "../services/domainEventService";

export class MultiVariantError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "MultiVariantError";
    this.statusCode = statusCode;
  }
}

export interface VariantResult {
  package: GraphPackage;
  diff: GraphDiffResult;
  validationErrors: GraphValidationError[];
  checksum: string;
}

const MAX_VARIANTS = 5;

/**
 * Generate multiple validated GraphPackage variants from a prompt.
 *
 * Calls the LLM adapter N times in parallel, validates each via Zod +
 * namespace guard, projects onto graph snapshot, and returns diff +
 * validation errors for each valid variant.
 *
 * Invalid variants are excluded (logged via telemetry).
 * Variants NEVER mutate drafts or graph — exploration only.
 */
export async function generateVariantsWithPreview(
  ctx: TenantContext,
  projectId: string,
  prompt: string,
  count: number,
  appName?: string,
): Promise<VariantResult[]> {
  if (count < 1 || count > MAX_VARIANTS) {
    throw new MultiVariantError(`count must be between 1 and ${MAX_VARIANTS}`, 400);
  }

  emitDomainEvent(ctx, {
    type: "vibe.variant_generation_requested",
    status: "started",
    entityId: "variant-generation",
    affectedRecords: { prompt, count, appName: appName ?? null },
  });

  const adapter = createLlmAdapter();

  // Generate N packages in parallel
  const rawResults = await Promise.allSettled(
    Array.from({ length: count }, () => adapter.generateGraphPackage(prompt, appName)),
  );

  // Build graph snapshot once for all projections
  const snapshot = await buildGraphSnapshot(ctx);

  const variants: VariantResult[] = [];
  let excludedCount = 0;

  for (const result of rawResults) {
    if (result.status === "rejected" || result.value === null || result.value === undefined) {
      excludedCount++;
      continue;
    }

    // Zod validate
    let pkg: GraphPackage;
    try {
      pkg = validateGraphPackage(result.value);
    } catch {
      excludedCount++;
      continue;
    }

    // Namespace guard
    if (!pkg.packageKey.startsWith("vibe.")) {
      excludedCount++;
      continue;
    }

    // Override packageKey if appName provided
    if (appName) {
      const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      pkg.packageKey = `vibe.${slug}`;
    }

    // Project onto graph snapshot
    const projected = projectPackageOntoSnapshot(snapshot, pkg, projectId, ctx.tenantId);
    const validationErrors = validateGraphSnapshot(projected);
    const diff = diffGraphSnapshots(snapshot, projected);
    const checksum = computePackageChecksum(pkg);

    variants.push({ package: pkg, diff, validationErrors, checksum });
  }

  emitDomainEvent(ctx, {
    type: "vibe.variant_generation_completed",
    status: "completed",
    entityId: "variant-generation",
    affectedRecords: {
      prompt,
      requested: count,
      generated: variants.length,
      excluded: excludedCount,
    },
  });

  return variants;
}
