import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import {
  computePackageChecksum,
  installGraphPackage,
  projectPackageOntoSnapshot,
} from "../graph/installGraphService";
import type { InstallResult } from "../graph/installGraphService";
import { buildGraphSnapshot } from "../graph/graphRegistryService";
import { validateGraphSnapshot } from "../graph/graphValidationService";
import { diffGraphSnapshots } from "../graph/graphDiffService";
import type { GraphDiffResult } from "../graph/graphDiffService";
import type { GraphValidationError } from "../graph/graphContracts";
import { emitDomainEvent } from "../services/domainEventService";
import { vibeTemplateRegistry } from "./vibeTemplates";
import { validateGraphPackage } from "./graphPackageSchema";
import { createLlmAdapter } from "./llmAdapter";

export class VibeServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "VibeServiceError";
    this.statusCode = statusCode;
  }
}

export interface VibePreviewResult {
  package: GraphPackage;
  checksum: string;
  diff: GraphDiffResult;
  validationErrors: GraphValidationError[];
  valid: boolean;
  matchedTemplate: string;
}

export interface VibeInstallResult {
  package: GraphPackage;
  installResult: InstallResult;
}

/** Reserved namespace prefixes that LLM-generated packages cannot use. */
const RESERVED_NAMESPACE_PREFIXES = ["hr.", "itsm."];

const llmAdapter = createLlmAdapter();

/**
 * Generate a GraphPackage from a natural-language prompt.
 *
 * Uses the LLM adapter to generate raw JSON, then validates the output
 * via Zod schema and enforces namespace safety guards. All LLM output
 * is treated as untrusted input.
 *
 * The returned package gets a unique packageKey by combining the template
 * prefix with a caller-supplied appName (slugified).
 */
export async function generatePackageFromPrompt(
  prompt: string,
  appName?: string,
  ctx?: TenantContext,
): Promise<GraphPackage> {
  // 1. Emit generation requested event
  if (ctx) {
    emitDomainEvent(ctx, {
      type: "vibe.llm_generation_requested",
      status: "started",
      entityId: "generation",
      affectedRecords: { prompt, appName: appName ?? null },
    });
  }

  // 2. Call LLM adapter
  const raw = await llmAdapter.generateGraphPackage(prompt, appName);

  if (raw === null || raw === undefined) {
    if (ctx) {
      emitDomainEvent(ctx, {
        type: "vibe.llm_generation_failed",
        status: "failed",
        entityId: "generation",
        error: { code: "NO_MATCH", message: `No matching template for prompt` },
        affectedRecords: { prompt },
      });
    }
    throw new VibeServiceError(
      `No matching template found for prompt: "${prompt}". Try keywords like: onboarding, pto, vendor, ticketing.`,
    );
  }

  // 3. Validate via Zod schema — LLM output is untrusted
  let pkg: GraphPackage;
  try {
    pkg = validateGraphPackage(raw);
  } catch (err) {
    if (ctx) {
      emitDomainEvent(ctx, {
        type: "vibe.llm_generation_failed",
        status: "failed",
        entityId: "generation",
        error: { code: "INVALID_GENERATED_PACKAGE", message: err instanceof Error ? err.message : "validation failed" },
        affectedRecords: { prompt },
      });
    }
    throw err;
  }

  // 4. Namespace guard
  for (const prefix of RESERVED_NAMESPACE_PREFIXES) {
    if (pkg.packageKey.startsWith(prefix)) {
      throw new VibeServiceError(
        `RESERVED_NAMESPACE: packageKey "${pkg.packageKey}" uses reserved prefix "${prefix}"`,
      );
    }
  }
  if (!pkg.packageKey.startsWith("vibe.")) {
    throw new VibeServiceError(
      `INVALID_NAMESPACE: packageKey "${pkg.packageKey}" must start with "vibe."`,
    );
  }

  // 5. Override packageKey if appName provided
  if (appName) {
    const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    pkg.packageKey = `vibe.${slug}`;
  }

  // 6. Emit success event
  if (ctx) {
    emitDomainEvent(ctx, {
      type: "vibe.llm_generation_succeeded",
      status: "completed",
      entityId: "generation",
      affectedRecords: {
        packageKey: pkg.packageKey,
        prompt,
        recordTypeCount: pkg.recordTypes.length,
      },
    });
  }

  return pkg;
}

/**
 * Refine a previously generated package by applying a refinement prompt.
 *
 * Tries LLM-based refinement first (if a real adapter is available).
 * On LLM failure or null result, falls back to deterministic pattern matching:
 * - "add field <name> to <recordType>" — adds a string field
 * - "rename to <appName>" — changes the packageKey
 * - "add sla <minutes> on <recordType>" — adds/replaces an SLA policy
 *
 * Returns a new package (does not mutate the input).
 */
export async function refinePackageFromPrompt(
  pkg: GraphPackage,
  refinementPrompt: string,
  ctx?: TenantContext,
): Promise<GraphPackage> {
  // Try LLM refinement first
  if (ctx) {
    emitDomainEvent(ctx, {
      type: "vibe.llm_refinement_requested",
      status: "started",
      entityId: "refinement",
      affectedRecords: { refinementPrompt, packageKey: pkg.packageKey },
    });
  }

  try {
    const existingJson = JSON.stringify(pkg);
    const raw = await llmAdapter.refineGraphPackage(existingJson, refinementPrompt);

    if (raw !== null && raw !== undefined) {
      // Validate LLM output — untrusted
      const refined = validateGraphPackage(raw);

      // Namespace guard
      for (const prefix of RESERVED_NAMESPACE_PREFIXES) {
        if (refined.packageKey.startsWith(prefix)) {
          throw new VibeServiceError(
            `RESERVED_NAMESPACE: packageKey "${refined.packageKey}" uses reserved prefix "${prefix}"`,
          );
        }
      }
      if (!refined.packageKey.startsWith("vibe.")) {
        throw new VibeServiceError(
          `INVALID_NAMESPACE: packageKey "${refined.packageKey}" must start with "vibe."`,
        );
      }

      if (ctx) {
        emitDomainEvent(ctx, {
          type: "vibe.llm_refinement_succeeded",
          status: "completed",
          entityId: "refinement",
          affectedRecords: {
            packageKey: refined.packageKey,
            refinementPrompt,
            recordTypeCount: refined.recordTypes.length,
          },
        });
      }

      return refined;
    }
    // LLM returned null — fall through to deterministic
  } catch (err) {
    if (ctx) {
      emitDomainEvent(ctx, {
        type: "vibe.llm_refinement_failed",
        status: "failed",
        entityId: "refinement",
        error: {
          code: err instanceof VibeServiceError ? "VALIDATION_FAILED" : "LLM_ERROR",
          message: err instanceof Error ? err.message : "unknown error",
        },
        affectedRecords: { refinementPrompt, packageKey: pkg.packageKey },
      });
    }
    // Fall through to deterministic refinement
  }

  // Deterministic fallback
  return refinePackageDeterministic(pkg, refinementPrompt);
}

/**
 * Deterministic refinement — pattern-based edits that don't require LLM.
 */
function refinePackageDeterministic(
  pkg: GraphPackage,
  refinementPrompt: string,
): GraphPackage {
  const refined = structuredClone(pkg);
  const lower = refinementPrompt.toLowerCase().trim();

  // Pattern: "add field <name> to <recordType>"
  const addFieldMatch = lower.match(/add\s+field\s+(\w+)\s+to\s+(\w+)/);
  if (addFieldMatch) {
    const [, fieldName, rtKey] = addFieldMatch;
    const rt = refined.recordTypes.find((r) => r.key === rtKey);
    if (!rt) {
      throw new VibeServiceError(`Record type "${rtKey}" not found in package`);
    }
    if (rt.fields.some((f) => f.name === fieldName)) {
      throw new VibeServiceError(`Field "${fieldName}" already exists on "${rtKey}"`);
    }
    rt.fields.push({ name: fieldName!, type: "string" });
    return refined;
  }

  // Pattern: "rename to <appName>"
  const renameMatch = lower.match(/rename\s+to\s+(.+)/);
  if (renameMatch) {
    const slug = renameMatch[1]!.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    refined.packageKey = `vibe.${slug}`;
    return refined;
  }

  // Pattern: "add sla <minutes> on <recordType>"
  const slaMatch = lower.match(/add\s+sla\s+(\d+)\s+on\s+(\w+)/);
  if (slaMatch) {
    const [, minutes, rtKey] = slaMatch;
    const rt = refined.recordTypes.find((r) => r.key === rtKey);
    if (!rt) {
      throw new VibeServiceError(`Record type "${rtKey}" not found in package`);
    }
    if (!refined.slaPolicies) refined.slaPolicies = [];
    const existingIdx = refined.slaPolicies.findIndex((s) => s.recordTypeKey === rtKey);
    if (existingIdx >= 0) {
      refined.slaPolicies[existingIdx]!.durationMinutes = parseInt(minutes!, 10);
    } else {
      refined.slaPolicies.push({ recordTypeKey: rtKey!, durationMinutes: parseInt(minutes!, 10) });
    }
    return refined;
  }

  // Pattern: flexible "add field" — "add field company to ticket as text",
  // "add a company field to ticket", "I need a field called company on ticket"
  const flexAddFieldMatch = lower.match(
    /(?:add|create|need)\s+(?:a\s+)?(?:field\s+(?:called\s+)?)?(\w+)\s+(?:field\s+)?(?:to|on|for)\s+(\w+)/,
  );
  if (flexAddFieldMatch) {
    const [, fieldName, rtKey] = flexAddFieldMatch;
    const rt = refined.recordTypes.find((r) => r.key === rtKey);
    if (!rt) {
      throw new VibeServiceError(
        `Record type "${rtKey}" not found in package. Available: ${refined.recordTypes.map((r) => r.key).join(", ")}`,
      );
    }
    if (rt.fields.some((f) => f.name === fieldName)) {
      throw new VibeServiceError(`Field "${fieldName}" already exists on "${rtKey}"`);
    }
    // Infer field type from optional suffix ("as text", "as number", etc.) or keywords
    const typeMatch = lower.match(/\s+(?:as|type)\s+(string|text|number|boolean|date|datetime|reference|choice)/);
    const TYPE_MAP: Record<string, string> = { text: "string", datetime: "date" };
    const rawType = typeMatch ? typeMatch[1]! : "string";
    const fieldType = TYPE_MAP[rawType] ?? rawType;
    rt.fields.push({ name: fieldName!, type: fieldType });
    return refined;
  }

  // Pattern: "remove field X from Y" / "drop X from Y"
  const removeFieldMatch = lower.match(
    /(?:remove|drop|delete)\s+(?:field\s+)?(\w+)\s+(?:from|on)\s+(\w+)/,
  );
  if (removeFieldMatch) {
    const [, fieldName, rtKey] = removeFieldMatch;
    const rt = refined.recordTypes.find((r) => r.key === rtKey);
    if (!rt) {
      throw new VibeServiceError(
        `Record type "${rtKey}" not found in package. Available: ${refined.recordTypes.map((r) => r.key).join(", ")}`,
      );
    }
    const fieldIdx = rt.fields.findIndex((f) => f.name === fieldName);
    if (fieldIdx < 0) {
      throw new VibeServiceError(
        `Field "${fieldName}" not found on "${rtKey}". Available: ${rt.fields.map((f) => f.name).join(", ")}`,
      );
    }
    rt.fields.splice(fieldIdx, 1);
    return refined;
  }

  // Pattern: "add record type X" / "add table X" / "create entity X"
  const addRtMatch = lower.match(
    /(?:add|create)\s+(?:a\s+)?(?:record\s*type|table|entity)\s+(\w+)/,
  );
  if (addRtMatch) {
    const [, rtName] = addRtMatch;
    const rtKey = rtName!;
    if (refined.recordTypes.some((r) => r.key === rtKey)) {
      throw new VibeServiceError(`Record type "${rtKey}" already exists in package`);
    }
    refined.recordTypes.push({
      key: rtKey,
      name: rtName!.charAt(0).toUpperCase() + rtName!.slice(1),
      fields: [
        { name: "name", type: "string", required: true },
      ],
    });
    return refined;
  }

  // Catch-all with helpful error
  const rtKeys = refined.recordTypes.map((r) => r.key).join(", ");
  throw new VibeServiceError(
    `Could not parse refinement: "${refinementPrompt}". ` +
    `Supported: "add field <name> to <type>", "remove field <name> from <type>", ` +
    `"add record type <name>", "rename to <name>", "add sla <minutes> on <type>". ` +
    `Available record types: ${rtKeys}`,
  );
}

/**
 * Preview a vibe-generated package by projecting it onto the current
 * graph snapshot and computing a diff + validation.
 *
 * Does NOT mutate the database.
 */
export async function previewVibePackage(
  ctx: TenantContext,
  projectId: string,
  pkg: GraphPackage,
): Promise<VibePreviewResult> {
  const checksum = computePackageChecksum(pkg);
  const current = await buildGraphSnapshot(ctx);
  const projected = projectPackageOntoSnapshot(current, pkg, projectId, ctx.tenantId);
  const validationErrors = validateGraphSnapshot(projected);
  const diff = diffGraphSnapshots(current, projected);

  // Find which template matched (for metadata)
  let matchedTemplate = "custom";
  for (const entry of vibeTemplateRegistry) {
    if (entry.template.packageKey === pkg.packageKey || pkg.packageKey.startsWith("vibe.")) {
      // Check if the record type keys overlap
      const templateKeys = new Set(entry.template.recordTypes.map((r) => r.key));
      const pkgKeys = new Set(pkg.recordTypes.map((r) => r.key));
      const overlap = [...templateKeys].filter((k) => pkgKeys.has(k));
      if (overlap.length > 0) {
        matchedTemplate = entry.template.packageKey;
        break;
      }
    }
  }

  emitDomainEvent(ctx, {
    type: "vibe.package_generated",
    status: "completed",
    entityId: projectId,
    affectedRecords: {
      packageKey: pkg.packageKey,
      checksum,
      valid: validationErrors.length === 0,
      matchedTemplate,
    },
  });

  return {
    package: pkg,
    checksum,
    diff,
    validationErrors,
    valid: validationErrors.length === 0,
    matchedTemplate,
  };
}

/**
 * Install a vibe-generated package by delegating to installGraphPackage.
 *
 * The vibe layer NEVER directly mutates the DB — all mutations go
 * through the standard install engine with its full safety model
 * (idempotency, version guard, ownership check, validation).
 */
export async function installVibePackage(
  ctx: TenantContext,
  projectId: string,
  pkg: GraphPackage,
  options?: { environmentId?: string },
): Promise<VibeInstallResult> {
  const installResult = await installGraphPackage(ctx, projectId, pkg, {
    environmentId: options?.environmentId,
    source: "install",
  });

  if (installResult.success && !installResult.noop) {
    emitDomainEvent(ctx, {
      type: "vibe.package_installed",
      status: "completed",
      entityId: projectId,
      affectedRecords: {
        packageKey: pkg.packageKey,
        version: pkg.version,
        checksum: installResult.checksum,
        environmentId: options?.environmentId ?? null,
      },
    });
  }

  return { package: pkg, installResult };
}
