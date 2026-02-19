import { storage } from "../storage";
import { emitTelemetry, buildTelemetryParams } from "./telemetryService";
import type { TenantContext } from "../tenant";

/**
 * Process all pending timers whose dueAt <= now.
 * Marks them as breached and emits telemetry.
 * Idempotent — breached timers are not reprocessed.
 * Never throws for individual timer failures.
 */
export async function processDueTimers(now?: Date): Promise<number> {
  const effectiveNow = now ?? new Date();
  const dueTimers = await storage.getDueTimers(effectiveNow);
  let processed = 0;

  for (const timer of dueTimers) {
    try {
      await storage.updateTimerStatus(timer.id, "breached");

      const ctx: TenantContext = { tenantId: timer.tenantId, source: "header" };
      emitTelemetry(buildTelemetryParams(ctx, {
        eventType: "record.sla.breached",
        executionType: "task",
        executionId: timer.recordId,
        status: "breached",
        affectedRecordIds: { recordId: timer.recordId, timerId: timer.id },
      }));

      processed++;
    } catch (_err) {
      // Individual timer failure must not halt processing
    }
  }

  return processed;
}
