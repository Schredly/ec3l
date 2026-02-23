import type { TenantContext } from "../tenant";
import type { PromotionIntent } from "@shared/schema";
import { getTenantStorage } from "../tenantStorage";
import { emitDomainEvent } from "../services/domainEventService";
import { diffEnvironments } from "./promotionService";
import { promoteEnvironmentPackages } from "./promotionService";
import { sendWebhook, buildPromotionApprovalPayload, buildPromotionExecutedPayload } from "../services/notificationService";

export class PromotionIntentError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PromotionIntentError";
    this.statusCode = statusCode;
  }
}

/**
 * State machine:
 *   draft     → previewed, rejected
 *   previewed → previewed (re-preview), approved, rejected
 *   approved  → executed, rejected
 *   executed  → (terminal)
 *   rejected  → (terminal)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["previewed", "rejected"],
  previewed: ["previewed", "approved", "rejected"],
  approved: ["executed", "rejected"],
};

function assertTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new PromotionIntentError(
      `Invalid state transition: "${from}" → "${to}"`,
    );
  }
}

export async function createPromotionIntent(
  ctx: TenantContext,
  data: { projectId: string; fromEnvironmentId: string; toEnvironmentId: string; createdBy?: string },
): Promise<PromotionIntent> {
  const ts = getTenantStorage(ctx);

  const fromEnv = await ts.getEnvironment(data.fromEnvironmentId);
  if (!fromEnv) throw new PromotionIntentError("Source environment not found", 404);

  const toEnv = await ts.getEnvironment(data.toEnvironmentId);
  if (!toEnv) throw new PromotionIntentError("Target environment not found", 404);

  if (data.fromEnvironmentId === data.toEnvironmentId) {
    throw new PromotionIntentError("Source and target environments must differ");
  }

  const intent = await ts.createPromotionIntent({
    projectId: data.projectId,
    fromEnvironmentId: data.fromEnvironmentId,
    toEnvironmentId: data.toEnvironmentId,
    createdBy: data.createdBy ?? null,
  });

  emitDomainEvent(ctx, {
    type: "graph.promotion_intent_created",
    status: "created",
    entityId: intent.id,
    affectedRecords: {
      projectId: data.projectId,
      fromEnvironmentId: data.fromEnvironmentId,
      toEnvironmentId: data.toEnvironmentId,
    } as unknown as Record<string, unknown>,
  });

  return intent;
}

export async function previewPromotionIntent(
  ctx: TenantContext,
  intentId: string,
): Promise<PromotionIntent> {
  const ts = getTenantStorage(ctx);

  const intent = await ts.getPromotionIntent(intentId);
  if (!intent) throw new PromotionIntentError("Promotion intent not found", 404);

  assertTransition(intent.status, "previewed");

  const diff = await diffEnvironments(ctx, intent.fromEnvironmentId, intent.toEnvironmentId);

  const updated = await ts.updatePromotionIntent(intentId, {
    status: "previewed",
    diff,
  });

  emitDomainEvent(ctx, {
    type: "graph.promotion_intent_previewed",
    status: "previewed",
    entityId: intentId,
  });

  // Best-effort webhook notification for approval-required environments
  const toEnv = await ts.getEnvironment(intent.toEnvironmentId);
  if (toEnv?.requiresPromotionApproval && toEnv?.promotionWebhookUrl) {
    const fromEnv = await ts.getEnvironment(intent.fromEnvironmentId);
    const payload = buildPromotionApprovalPayload(updated!, fromEnv!, toEnv, diff);
    const webhookResult = await sendWebhook(toEnv.promotionWebhookUrl, payload);
    await ts.updatePromotionIntent(intentId, {
      notificationStatus: webhookResult.success ? "sent" : "failed",
      notificationLastError: webhookResult.error ?? null,
      notificationLastAttemptAt: new Date(),
    });
    emitDomainEvent(ctx, {
      type: webhookResult.success ? "graph.promotion_notification_sent" : "graph.promotion_notification_failed",
      status: webhookResult.success ? "sent" : "failed",
      entityId: intentId,
      error: webhookResult.error ? { message: webhookResult.error } : undefined,
      affectedRecords: { intentId, targetEnvironmentId: toEnv.id },
    });
  }

  return updated!;
}

export async function approvePromotionIntent(
  ctx: TenantContext,
  intentId: string,
  approvedBy: string,
): Promise<PromotionIntent> {
  const ts = getTenantStorage(ctx);

  const intent = await ts.getPromotionIntent(intentId);
  if (!intent) throw new PromotionIntentError("Promotion intent not found", 404);

  assertTransition(intent.status, "approved");

  const updated = await ts.updatePromotionIntent(intentId, {
    status: "approved",
    approvedBy,
    approvedAt: new Date(),
  });

  emitDomainEvent(ctx, {
    type: "graph.promotion_intent_approved",
    status: "approved",
    entityId: intentId,
    affectedRecords: { approvedBy } as unknown as Record<string, unknown>,
  });

  return updated!;
}

export async function executePromotionIntent(
  ctx: TenantContext,
  intentId: string,
): Promise<PromotionIntent> {
  const ts = getTenantStorage(ctx);

  const intent = await ts.getPromotionIntent(intentId);
  if (!intent) throw new PromotionIntentError("Promotion intent not found", 404);

  assertTransition(intent.status, "executed");

  const result = await promoteEnvironmentPackages(
    ctx,
    intent.fromEnvironmentId,
    intent.toEnvironmentId,
    intent.projectId,
  );

  const updated = await ts.updatePromotionIntent(intentId, {
    status: "executed",
    result,
  });

  emitDomainEvent(ctx, {
    type: "graph.promotion_intent_executed",
    status: "executed",
    entityId: intentId,
    affectedRecords: {
      success: result.success,
      promoted: result.promoted.length,
      skipped: result.skipped.length,
    } as unknown as Record<string, unknown>,
  });

  // Best-effort webhook notification for executed promotions
  const toEnv = await ts.getEnvironment(intent.toEnvironmentId);
  if (toEnv?.promotionWebhookUrl) {
    const fromEnv = await ts.getEnvironment(intent.fromEnvironmentId);
    const payload = buildPromotionExecutedPayload(updated!, fromEnv!, toEnv, result);
    const webhookResult = await sendWebhook(toEnv.promotionWebhookUrl, payload);
    emitDomainEvent(ctx, {
      type: webhookResult.success ? "graph.promotion_notification_sent" : "graph.promotion_notification_failed",
      status: webhookResult.success ? "sent" : "failed",
      entityId: intentId,
      error: webhookResult.error ? { message: webhookResult.error } : undefined,
      affectedRecords: { intentId, targetEnvironmentId: toEnv.id },
    });
  }

  return updated!;
}

export async function rejectPromotionIntent(
  ctx: TenantContext,
  intentId: string,
): Promise<PromotionIntent> {
  const ts = getTenantStorage(ctx);

  const intent = await ts.getPromotionIntent(intentId);
  if (!intent) throw new PromotionIntentError("Promotion intent not found", 404);

  assertTransition(intent.status, "rejected");

  const updated = await ts.updatePromotionIntent(intentId, {
    status: "rejected",
  });

  emitDomainEvent(ctx, {
    type: "graph.promotion_intent_rejected",
    status: "rejected",
    entityId: intentId,
  });

  return updated!;
}

export async function listPromotionIntents(
  ctx: TenantContext,
  projectId?: string,
): Promise<PromotionIntent[]> {
  const ts = getTenantStorage(ctx);
  return ts.listPromotionIntents(projectId);
}
