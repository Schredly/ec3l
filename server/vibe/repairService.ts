import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import type { GraphDiffResult } from "../graph/graphDiffService";
import type { GraphValidationError } from "../graph/graphContracts";
import { emitDomainEvent } from "../services/domainEventService";
import { generatePackageFromPrompt, previewVibePackage, VibeServiceError } from "./vibeService";
import { validateGraphPackage } from "./graphPackageSchema";
import { createLlmAdapter } from "./llmAdapter";

export interface RepairResult {
  /** The validated package, if generation succeeded. Null if all attempts failed. */
  package: GraphPackage | null;
  /** Package checksum, if a valid package was produced. */
  checksum: string | null;
  /** Graph diff from preview pipeline, if preview was reached. */
  diff: GraphDiffResult | null;
  /** Graph validation errors from preview pipeline (e.g., orphan baseType). */
  validationErrors: GraphValidationError[];
  /** Schema validation errors from Zod (only set if ALL attempts failed). */
  schemaErrors: string | null;
  /** How many generation attempts were made. */
  attempts: number;
  /** Whether a valid, error-free package was produced. */
  success: boolean;
}

export interface RepairOptions {
  /** Maximum number of LLM generation attempts (including initial). Default: 2. */
  maxAttempts?: number;
}

/**
 * Generate a GraphPackage from a prompt with optional schema repair loop,
 * then run the preview pipeline (project → validate → diff).
 *
 * NEVER calls install. Always returns preview-only results.
 *
 * Flow:
 * 1. Generate candidate via LLM adapter
 * 2. Zod validate — if fails and attempts remain, feed errors back to LLM
 * 3. If schema passes, run preview pipeline (project → validate → diff)
 * 4. Return results including any projection validation errors
 */
export async function generateAndPreviewWithRepair(
  ctx: TenantContext,
  projectId: string,
  prompt: string,
  options?: RepairOptions & { appName?: string },
): Promise<RepairResult> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const appName = options?.appName;
  const adapter = createLlmAdapter();

  let lastSchemaError: string | null = null;
  let lastRawOutput: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let pkg: GraphPackage;

      if (attempt === 1) {
        // First attempt: use the standard generation flow
        pkg = await generatePackageFromPrompt(prompt, appName, ctx);
      } else {
        // Repair attempt: feed errors back to the adapter
        emitDomainEvent(ctx, {
          type: "vibe.llm_repair_attempted",
          status: "started",
          entityId: "generation",
          affectedRecords: {
            prompt,
            attempt,
            previousErrors: lastSchemaError,
          },
        });

        const raw = await adapter.repairGraphPackage(
          prompt,
          lastRawOutput ?? "",
          lastSchemaError ?? "",
        );

        if (raw === null || raw === undefined) {
          // Repair returned nothing — give up
          return {
            package: null,
            checksum: null,
            diff: null,
            validationErrors: [],
            schemaErrors: lastSchemaError,
            attempts: attempt,
            success: false,
          };
        }

        // Validate the repaired output
        pkg = validateGraphPackage(raw);

        // Namespace guard (same as generatePackageFromPrompt)
        const RESERVED = ["hr.", "itsm."];
        for (const prefix of RESERVED) {
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

        // Override packageKey if appName provided
        if (appName) {
          const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          pkg.packageKey = `vibe.${slug}`;
        }
      }

      // Schema validation passed — run preview pipeline
      const preview = await previewVibePackage(ctx, projectId, pkg);

      return {
        package: preview.package,
        checksum: preview.checksum,
        diff: preview.diff,
        validationErrors: preview.validationErrors,
        schemaErrors: null,
        attempts: attempt,
        success: preview.valid,
      };
    } catch (err) {
      if (err instanceof VibeServiceError && err.message.startsWith("INVALID_GENERATED_PACKAGE:")) {
        // Schema validation failed — record error for potential repair
        lastSchemaError = err.message;
        // Try to preserve the raw output for the repair prompt
        lastRawOutput = lastRawOutput ?? `[schema error: ${err.message}]`;

        if (attempt >= maxAttempts) {
          // All attempts exhausted
          return {
            package: null,
            checksum: null,
            diff: null,
            validationErrors: [],
            schemaErrors: lastSchemaError,
            attempts: attempt,
            success: false,
          };
        }
        // Continue to next attempt (repair)
        continue;
      }

      // Non-schema error (namespace guard, no match, etc.) — don't retry
      throw err;
    }
  }

  // Should not reach here, but safety return
  return {
    package: null,
    checksum: null,
    diff: null,
    validationErrors: [],
    schemaErrors: lastSchemaError,
    attempts: maxAttempts,
    success: false,
  };
}

/**
 * Streaming stage event emitted during generateAndPreviewWithRepairStreaming.
 */
export interface StreamStageEvent {
  stage: "generation" | "validation" | "repair" | "projection" | "diff" | "complete" | "error";
  attempt?: number;
  result?: RepairResult;
  error?: string;
}

/**
 * Streaming variant of generateAndPreviewWithRepair.
 * Calls `onStage` with structured events as the pipeline progresses.
 *
 * NEVER calls install. Always preview-only.
 */
export async function generateAndPreviewWithRepairStreaming(
  ctx: TenantContext,
  projectId: string,
  prompt: string,
  onStage: (event: StreamStageEvent) => void,
  options?: RepairOptions & { appName?: string },
): Promise<RepairResult> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const appName = options?.appName;
  const adapter = createLlmAdapter();

  let lastSchemaError: string | null = null;
  let lastRawOutput: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let pkg: GraphPackage;

      if (attempt === 1) {
        onStage({ stage: "generation" });
        pkg = await generatePackageFromPrompt(prompt, appName, ctx);
      } else {
        onStage({ stage: "repair", attempt });

        emitDomainEvent(ctx, {
          type: "vibe.llm_repair_attempted",
          status: "started",
          entityId: "generation",
          affectedRecords: { prompt, attempt, previousErrors: lastSchemaError },
        });

        const raw = await adapter.repairGraphPackage(
          prompt,
          lastRawOutput ?? "",
          lastSchemaError ?? "",
        );

        if (raw === null || raw === undefined) {
          const result: RepairResult = {
            package: null,
            checksum: null,
            diff: null,
            validationErrors: [],
            schemaErrors: lastSchemaError,
            attempts: attempt,
            success: false,
          };
          onStage({ stage: "complete", result });
          return result;
        }

        pkg = validateGraphPackage(raw);

        const RESERVED = ["hr.", "itsm."];
        for (const prefix of RESERVED) {
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

        if (appName) {
          const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          pkg.packageKey = `vibe.${slug}`;
        }
      }

      onStage({ stage: "validation" });
      onStage({ stage: "projection" });

      const preview = await previewVibePackage(ctx, projectId, pkg);

      onStage({ stage: "diff" });

      const result: RepairResult = {
        package: preview.package,
        checksum: preview.checksum,
        diff: preview.diff,
        validationErrors: preview.validationErrors,
        schemaErrors: null,
        attempts: attempt,
        success: preview.valid,
      };
      onStage({ stage: "complete", result });
      return result;
    } catch (err) {
      if (err instanceof VibeServiceError && err.message.startsWith("INVALID_GENERATED_PACKAGE:")) {
        lastSchemaError = err.message;
        lastRawOutput = lastRawOutput ?? `[schema error: ${err.message}]`;

        if (attempt >= maxAttempts) {
          const result: RepairResult = {
            package: null,
            checksum: null,
            diff: null,
            validationErrors: [],
            schemaErrors: lastSchemaError,
            attempts: attempt,
            success: false,
          };
          onStage({ stage: "complete", result });
          return result;
        }
        continue;
      }

      onStage({ stage: "error", error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  const result: RepairResult = {
    package: null,
    checksum: null,
    diff: null,
    validationErrors: [],
    schemaErrors: lastSchemaError,
    attempts: maxAttempts,
    success: false,
  };
  onStage({ stage: "complete", result });
  return result;
}
