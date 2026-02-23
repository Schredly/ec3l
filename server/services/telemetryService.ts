import { randomUUID } from "crypto";
import { storage } from "../storage";
import type { TenantContext } from "../tenant";
import type { InsertExecutionTelemetryEvent } from "@shared/schema";

type TelemetryParams = Omit<InsertExecutionTelemetryEvent, "tenantId"> & { tenantId: string };

/**
 * @internal Low-level telemetry writer — prefer `emitDomainEvent` from domainEventService.
 * Fire-and-forget. Never throws.
 */
export function emitTelemetry(params: TelemetryParams): void {
  storage.createExecutionTelemetryEvent(params).catch((err) => {
    console.error(
      `[telemetry] Failed to emit ${params.eventType}: ${err instanceof Error ? err.message : err}`,
    );
  });
}

/**
 * @internal Low-level param builder — prefer `emitDomainEvent` from domainEventService.
 * Build common telemetry fields from a TenantContext.
 */
export function buildTelemetryParams(
  ctx: TenantContext,
  overrides: Partial<TelemetryParams> & Pick<TelemetryParams, "eventType" | "executionType" | "status">,
): TelemetryParams {
  const actorType = ctx.agentId ? "agent" : ctx.userId ? "user" : "system";
  const actorId = ctx.agentId ?? ctx.userId ?? null;

  return {
    tenantId: ctx.tenantId,
    moduleId: "system",
    executionId: randomUUID(),
    executionType: overrides.executionType,
    eventType: overrides.eventType,
    actorType,
    actorId,
    status: overrides.status,
    workflowId: null,
    workflowStepId: null,
    ...overrides,
  };
}
