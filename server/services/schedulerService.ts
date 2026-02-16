import { storage } from "../storage";
import type { WorkflowExecutionIntent } from "@shared/schema";

type SchedulerState = {
  running: boolean;
  intervalHandle: ReturnType<typeof setInterval> | null;
  lastCheckByTrigger: Map<string, number>;
};

const state: SchedulerState = {
  running: false,
  intervalHandle: null,
  lastCheckByTrigger: new Map(),
};

const SCHEDULER_POLL_INTERVAL_MS = 60_000;

function parseIntervalMs(interval: string): number | null {
  const match = interval.match(/^(\d+)(s|m|h)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return value * 1000;
    case "m": return value * 60_000;
    case "h": return value * 3_600_000;
    default: return null;
  }
}

function cronMatchesNow(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const now = new Date();
  const minute = now.getMinutes();
  const hour = now.getHours();

  const matchesPart = (part: string, value: number): boolean => {
    if (part === "*") return true;
    if (part.includes("/")) {
      const [, step] = part.split("/");
      return value % parseInt(step, 10) === 0;
    }
    return parseInt(part, 10) === value;
  };

  return matchesPart(parts[0], minute) && matchesPart(parts[1], hour);
}

async function checkScheduledTriggers(): Promise<WorkflowExecutionIntent[]> {
  const emitted: WorkflowExecutionIntent[] = [];

  const tenantList = await storage.getTenants();
  for (const tenant of tenantList) {
    const triggers = await storage.getActiveTriggersByTenantAndType(tenant.id, "schedule");

    for (const trigger of triggers) {
      const config = trigger.triggerConfig as Record<string, unknown> | null;
      if (!config) continue;

      const wf = await storage.getWorkflowDefinition(trigger.workflowDefinitionId);
      if (!wf || wf.status !== "active") continue;

      let shouldFire = false;

      if (typeof config.cron === "string") {
        if (cronMatchesNow(config.cron)) {
          const lastCheck = state.lastCheckByTrigger.get(trigger.id) || 0;
          const now = Date.now();
          if (now - lastCheck >= 55_000) {
            shouldFire = true;
            state.lastCheckByTrigger.set(trigger.id, now);
          }
        }
      } else if (typeof config.interval === "string") {
        const intervalMs = parseIntervalMs(config.interval);
        if (intervalMs) {
          const lastCheck = state.lastCheckByTrigger.get(trigger.id) || 0;
          const now = Date.now();
          if (now - lastCheck >= intervalMs) {
            shouldFire = true;
            state.lastCheckByTrigger.set(trigger.id, now);
          }
        }
      }

      if (shouldFire) {
        const minuteBucket = Math.floor(Date.now() / 60000);
        const idempotencyKey = `schedule:${trigger.id}:${trigger.workflowDefinitionId}:${minuteBucket}`;

        const intent = await storage.createWorkflowExecutionIntent({
          tenantId: tenant.id,
          workflowDefinitionId: trigger.workflowDefinitionId,
          triggerType: "schedule",
          triggerPayload: {
            triggerId: trigger.id,
            scheduledAt: new Date().toISOString(),
            cronOrInterval: config.cron || config.interval,
          },
          idempotencyKey,
        });
        emitted.push(intent);
      }
    }
  }

  return emitted;
}

export function startScheduler(): void {
  if (state.running) return;
  state.running = true;
  state.intervalHandle = setInterval(async () => {
    try {
      await checkScheduledTriggers();
    } catch (_err) {
    }
  }, SCHEDULER_POLL_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (state.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
  }
  state.running = false;
  state.lastCheckByTrigger.clear();
}

export function isSchedulerRunning(): boolean {
  return state.running;
}

export { checkScheduledTriggers };
