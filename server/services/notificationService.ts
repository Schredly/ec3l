/**
 * Webhook notification service for promotion approval lifecycle.
 *
 * Best-effort: sendWebhook NEVER throws. All errors are returned as
 * structured results. Callers decide how to handle failures.
 */

export interface WebhookResult {
  success: boolean;
  error?: string;
}

/**
 * POST a JSON payload to the given URL with a timeout.
 * Returns a structured result — never throws.
 */
export async function sendWebhook(
  url: string,
  payload: unknown,
  timeoutMs = 5000,
): Promise<WebhookResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      return { success: true };
    }

    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Build a Slack-compatible payload for approval-required notifications.
 */
export function buildPromotionApprovalPayload(
  intent: { id: string; projectId: string; createdBy: string | null; createdAt: Date },
  fromEnv: { id: string; name: string },
  toEnv: { id: string; name: string },
  diff: unknown,
): Record<string, unknown> {
  return {
    event: "promotion.approval_required",
    text: `Promotion approval required: ${fromEnv.name} → ${toEnv.name}`,
    intentId: intent.id,
    projectId: intent.projectId,
    fromEnvironment: { id: fromEnv.id, name: fromEnv.name },
    toEnvironment: { id: toEnv.id, name: toEnv.name },
    createdBy: intent.createdBy,
    diff,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a Slack-compatible payload for promotion-executed notifications.
 */
export function buildPromotionExecutedPayload(
  intent: { id: string; projectId: string; createdBy: string | null },
  fromEnv: { id: string; name: string },
  toEnv: { id: string; name: string },
  result: { promoted?: unknown[]; skipped?: unknown[] },
): Record<string, unknown> {
  return {
    event: "promotion.executed",
    text: `Promotion executed: ${fromEnv.name} → ${toEnv.name} (${result.promoted?.length ?? 0} promoted, ${result.skipped?.length ?? 0} skipped)`,
    intentId: intent.id,
    projectId: intent.projectId,
    fromEnvironment: { id: fromEnv.id, name: fromEnv.name },
    toEnvironment: { id: toEnv.id, name: toEnv.name },
    createdBy: intent.createdBy,
    promoted: result.promoted?.length ?? 0,
    skipped: result.skipped?.length ?? 0,
    timestamp: new Date().toISOString(),
  };
}
