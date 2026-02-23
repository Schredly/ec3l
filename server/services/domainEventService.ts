import { storage } from "../storage";
import type { TenantContext } from "../tenant";

export type DomainEventType =
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "workflow.intent.started"
  | "workflow.intent.completed"
  | "workflow.intent.failed"
  | "record.assigned"
  | "record.sla.created"
  | "record.sla.breached"
  | "graph.validation_failed"
  | "graph.validation_succeeded"
  | "graph.diff_computed"
  | "graph.package_installed"
  | "graph.package_install_noop"
  | "graph.package_install_rejected"
  | "graph.package_promoted"
  | "graph.promotion_intent_created"
  | "graph.promotion_intent_previewed"
  | "graph.promotion_intent_approved"
  | "graph.promotion_intent_executed"
  | "graph.promotion_intent_rejected"
  | "vibe.package_generated"
  | "vibe.package_installed"
  | "vibe.draft_created"
  | "vibe.draft_refined"
  | "vibe.draft_previewed"
  | "vibe.draft_installed"
  | "vibe.llm_generation_requested"
  | "vibe.llm_generation_succeeded"
  | "vibe.llm_generation_failed"
  | "vibe.llm_repair_attempted"
  | "vibe.llm_refinement_requested"
  | "vibe.llm_refinement_succeeded"
  | "vibe.llm_refinement_failed"
  | "vibe.draft_discarded"
  | "vibe.draft_patched"
  | "vibe.draft_version_created"
  | "vibe.draft_restored"
  | "vibe.variant_generation_requested"
  | "vibe.variant_generation_completed"
  | "vibe.draft_created_from_variant"
  | "vibe.variant_diff_computed"
  | "vibe.draft_variant_adopted"
  | "vibe.llm_token_stream_started"
  | "vibe.llm_token_stream_completed"
  | "vibe.llm_token_stream_failed"
  | "vibe.draft_version_diff_computed"
  | "graph.promotion_notification_sent"
  | "graph.promotion_notification_failed";

export interface DomainEvent {
  type: DomainEventType;
  status: string;
  entityId: string;
  workflowId?: string | null;
  workflowStepId?: string | null;
  moduleId?: string;
  error?: { code?: string; message: string };
  affectedRecords?: Record<string, unknown> | unknown[] | null;
}

export type DomainEventHandler = (
  ctx: TenantContext,
  event: DomainEvent,
) => void | Promise<void>;

const subscribers = new Map<DomainEventType, DomainEventHandler[]>();

export function subscribe(
  eventType: DomainEventType,
  handler: DomainEventHandler,
): () => void {
  const handlers = subscribers.get(eventType) ?? [];
  handlers.push(handler);
  subscribers.set(eventType, handlers);

  return () => {
    const current = subscribers.get(eventType);
    if (current) {
      const idx = current.indexOf(handler);
      if (idx !== -1) current.splice(idx, 1);
    }
  };
}

export function clearSubscribers(): void {
  subscribers.clear();
}

function notifySubscribers(ctx: TenantContext, event: DomainEvent): void {
  const handlers = subscribers.get(event.type);
  if (!handlers || handlers.length === 0) return;
  for (const handler of handlers) {
    Promise.resolve()
      .then(() => handler(ctx, event))
      .catch((err) => {
        console.error(
          `[domain-event] Subscriber error for ${event.type}: ${err instanceof Error ? err.message : err}`,
        );
      });
  }
}

/**
 * Emit a tenant-scoped domain event to the execution telemetry table.
 *
 * Derives `actorType`/`actorId` from ctx and `executionType` from
 * `workflowId` presence (`workflow_step` if set, `task` otherwise).
 * Fire-and-forget — never throws.
 *
 * Scope: control-plane events only. Runner telemetry uses a separate path.
 */
export function emitDomainEvent(ctx: TenantContext, event: DomainEvent): void {
  const actorType = ctx.agentId ? "agent" : ctx.userId ? "user" : "system";
  const actorId = ctx.agentId ?? ctx.userId ?? null;
  const executionType = event.workflowId ? "workflow_step" : "task";

  storage
    .createExecutionTelemetryEvent({
      tenantId: ctx.tenantId,
      eventType: event.type,
      executionType,
      executionId: event.entityId,
      moduleId: event.moduleId ?? "system",
      actorType,
      actorId,
      status: event.status,
      workflowId: event.workflowId ?? null,
      workflowStepId: event.workflowStepId ?? null,
      errorCode: event.error?.code ?? null,
      errorMessage: event.error?.message ?? null,
      affectedRecordIds: event.affectedRecords ?? null,
    })
    .catch((err) => {
      console.error(
        `[domain-event] Failed to emit ${event.type}: ${err instanceof Error ? err.message : err}`,
      );
    });

  notifySubscribers(ctx, event);
}
