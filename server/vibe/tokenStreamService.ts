import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import { computePackageChecksum, projectPackageOntoSnapshot } from "../graph/installGraphService";
import { buildGraphSnapshot } from "../graph/graphRegistryService";
import { validateGraphSnapshot } from "../graph/graphValidationService";
import { diffGraphSnapshots } from "../graph/graphDiffService";
import type { GraphDiffResult } from "../graph/graphDiffService";
import type { GraphValidationError } from "../graph/graphContracts";
import { emitDomainEvent } from "../services/domainEventService";
import { validateGraphPackage } from "./graphPackageSchema";
import { createLlmAdapter, extractJson } from "./llmAdapter";

/** Reserved namespace prefixes that LLM-generated packages cannot use. */
const RESERVED_NAMESPACE_PREFIXES = ["hr.", "itsm."];

/**
 * SSE event types emitted during token-level streaming.
 * - token: individual LLM output token (display-only, untrusted)
 * - stage: pipeline stage transition
 * - complete: final validated result
 * - error: unrecoverable error
 */
export type TokenStreamEvent =
  | { type: "token"; data: string }
  | { type: "stage"; stage: TokenStreamStage; attempt?: number }
  | { type: "complete"; result: TokenStreamResult }
  | { type: "error"; error: string };

export type TokenStreamStage =
  | "generation"
  | "extract_json"
  | "validate_schema"
  | "repair"
  | "projection"
  | "diff"
  | "complete";

export interface TokenStreamResult {
  package: GraphPackage | null;
  checksum: string | null;
  diff: GraphDiffResult | null;
  validationErrors: GraphValidationError[];
  schemaErrors: string | null;
  attempts: number;
  success: boolean;
}

export interface TokenStreamOptions {
  maxAttempts?: number;
  appName?: string;
}

/**
 * Generate a GraphPackage with token-level streaming, then run the
 * preview pipeline (extract → validate → repair → project → diff).
 *
 * NEVER calls install or creates drafts. Preview-only.
 *
 * Calls `onEvent` for each SSE event (token, stage, complete, error).
 * Tokens are display-only — the actual package is extracted from the
 * accumulated buffer and validated via Zod + namespace guard.
 */
export async function generateAndPreviewWithTokenStreaming(
  ctx: TenantContext,
  projectId: string,
  prompt: string,
  onEvent: (event: TokenStreamEvent) => void,
  options?: TokenStreamOptions,
): Promise<TokenStreamResult> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const appName = options?.appName;
  const adapter = createLlmAdapter();

  emitDomainEvent(ctx, {
    type: "vibe.llm_token_stream_started",
    status: "started",
    entityId: "token-stream",
    affectedRecords: { prompt, appName: appName ?? null },
  });

  let lastSchemaError: string | null = null;
  let lastRawOutput: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let pkg: GraphPackage;

      if (attempt === 1) {
        // Stream generation tokens
        onEvent({ type: "stage", stage: "generation" });
        let buffer = "";
        const gen = adapter.streamGenerate(prompt, appName);
        for await (const token of gen) {
          buffer += token;
          onEvent({ type: "token", data: token });
        }

        lastRawOutput = buffer;

        // Extract JSON from accumulated buffer
        onEvent({ type: "stage", stage: "extract_json" });
        const raw = extractJson(buffer);
        if (raw === null || raw === undefined) {
          lastSchemaError = "Failed to extract valid JSON from LLM output";
          if (attempt >= maxAttempts) {
            const result: TokenStreamResult = {
              package: null, checksum: null, diff: null,
              validationErrors: [], schemaErrors: lastSchemaError,
              attempts: attempt, success: false,
            };
            onEvent({ type: "complete", result });
            emitDomainEvent(ctx, {
              type: "vibe.llm_token_stream_completed",
              status: "completed",
              entityId: "token-stream",
              affectedRecords: { success: false, attempts: attempt },
            });
            return result;
          }
          continue;
        }

        // Validate via Zod
        onEvent({ type: "stage", stage: "validate_schema" });
        pkg = validateGraphPackage(raw);
      } else {
        // Repair attempt (non-streaming for v1)
        onEvent({ type: "stage", stage: "repair", attempt });

        emitDomainEvent(ctx, {
          type: "vibe.llm_repair_attempted",
          status: "started",
          entityId: "token-stream",
          affectedRecords: { prompt, attempt, previousErrors: lastSchemaError },
        });

        const raw = await adapter.repairGraphPackage(
          prompt,
          lastRawOutput ?? "",
          lastSchemaError ?? "",
        );

        if (raw === null || raw === undefined) {
          const result: TokenStreamResult = {
            package: null, checksum: null, diff: null,
            validationErrors: [], schemaErrors: lastSchemaError,
            attempts: attempt, success: false,
          };
          onEvent({ type: "complete", result });
          emitDomainEvent(ctx, {
            type: "vibe.llm_token_stream_completed",
            status: "completed",
            entityId: "token-stream",
            affectedRecords: { success: false, attempts: attempt },
          });
          return result;
        }

        onEvent({ type: "stage", stage: "validate_schema" });
        pkg = validateGraphPackage(raw);
      }

      // Namespace guard
      for (const prefix of RESERVED_NAMESPACE_PREFIXES) {
        if (pkg.packageKey.startsWith(prefix)) {
          throw new NamespaceError(
            `RESERVED_NAMESPACE: packageKey "${pkg.packageKey}" uses reserved prefix "${prefix}"`,
          );
        }
      }
      if (!pkg.packageKey.startsWith("vibe.")) {
        throw new NamespaceError(
          `INVALID_NAMESPACE: packageKey "${pkg.packageKey}" must start with "vibe."`,
        );
      }

      // Override packageKey if appName provided
      if (appName) {
        const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        pkg.packageKey = `vibe.${slug}`;
      }

      // Project → validate → diff
      onEvent({ type: "stage", stage: "projection" });
      const checksum = computePackageChecksum(pkg);
      const snapshot = await buildGraphSnapshot(ctx);
      const projected = projectPackageOntoSnapshot(snapshot, pkg, projectId, ctx.tenantId);
      const validationErrors = validateGraphSnapshot(projected);

      onEvent({ type: "stage", stage: "diff" });
      const diff = diffGraphSnapshots(snapshot, projected);

      const result: TokenStreamResult = {
        package: pkg,
        checksum,
        diff,
        validationErrors,
        schemaErrors: null,
        attempts: attempt,
        success: validationErrors.length === 0,
      };
      onEvent({ type: "complete", result });

      emitDomainEvent(ctx, {
        type: "vibe.llm_token_stream_completed",
        status: "completed",
        entityId: "token-stream",
        affectedRecords: {
          success: true,
          packageKey: pkg.packageKey,
          checksum,
          attempts: attempt,
        },
      });

      return result;
    } catch (err) {
      // Schema validation failure — potentially retryable
      if (err instanceof Error && err.message.startsWith("INVALID_GENERATED_PACKAGE:")) {
        lastSchemaError = err.message;
        lastRawOutput = lastRawOutput ?? `[schema error: ${err.message}]`;

        if (attempt >= maxAttempts) {
          const result: TokenStreamResult = {
            package: null, checksum: null, diff: null,
            validationErrors: [], schemaErrors: lastSchemaError,
            attempts: attempt, success: false,
          };
          onEvent({ type: "complete", result });
          emitDomainEvent(ctx, {
            type: "vibe.llm_token_stream_completed",
            status: "completed",
            entityId: "token-stream",
            affectedRecords: { success: false, attempts: attempt },
          });
          return result;
        }
        continue;
      }

      // Non-retryable error
      const message = err instanceof Error ? err.message : String(err);
      onEvent({ type: "error", error: message });
      emitDomainEvent(ctx, {
        type: "vibe.llm_token_stream_failed",
        status: "failed",
        entityId: "token-stream",
        error: { code: "STREAM_ERROR", message },
        affectedRecords: { prompt },
      });
      throw err;
    }
  }

  // Safety fallback
  const result: TokenStreamResult = {
    package: null, checksum: null, diff: null,
    validationErrors: [], schemaErrors: lastSchemaError,
    attempts: maxAttempts, success: false,
  };
  onEvent({ type: "complete", result });
  return result;
}

/**
 * Streaming multi-variant generation. Generates variants sequentially,
 * streaming tokens for each one. Max 3 variants for streaming endpoint.
 *
 * NEVER calls install or creates drafts. Exploration-only.
 */
export async function generateMultiWithTokenStreaming(
  ctx: TenantContext,
  projectId: string,
  prompt: string,
  count: number,
  onEvent: (event: TokenStreamEvent & { variantIndex?: number }) => void,
  options?: { appName?: string },
): Promise<TokenStreamResult[]> {
  const MAX_STREAMING_VARIANTS = 3;
  if (count < 1 || count > MAX_STREAMING_VARIANTS) {
    throw new MultiStreamError(`count must be between 1 and ${MAX_STREAMING_VARIANTS} for streaming`);
  }

  const results: TokenStreamResult[] = [];

  for (let i = 0; i < count; i++) {
    const variantResult = await generateAndPreviewWithTokenStreaming(
      ctx,
      projectId,
      prompt,
      (event) => onEvent({ ...event, variantIndex: i }),
      { maxAttempts: 2, appName: options?.appName },
    );
    results.push(variantResult);
  }

  return results;
}

class NamespaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamespaceError";
  }
}

export class MultiStreamError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "MultiStreamError";
  }
}
