import { storage } from "../storage";
import { emitDomainEvent } from "./domainEventService";
import type { TenantContext } from "../tenant";

/**
 * Process all pending timers whose dueAt <= now.
 * Marks them as breached and emits telemetry.
 * Idempotent — breached timers are not reprocessed.
 * Never throws for individual timer failures.
 */
export async function processDueTimers(now?: Date, tenantId?: string): Promise<number> {
  const effectiveNow = now ?? new Date();
  const dueTimers = tenantId
    ? await storage.getDueTimersByTenant(tenantId, effectiveNow)
    : await storage.getDueTimers(effectiveNow);
  let processed = 0;

  for (const timer of dueTimers) {
    try {
      await storage.updateTimerStatus(timer.id, "breached");

      const ctx: TenantContext = { tenantId: timer.tenantId, source: "header" };
      emitDomainEvent(ctx, {
        type: "record.sla.breached",
        status: "breached",
        entityId: timer.recordId,
        affectedRecords: { recordId: timer.recordId, timerId: timer.id },
      });

      processed++;
    } catch (_err) {
      // Individual timer failure must not halt processing
    }
  }

  return processed;
}
