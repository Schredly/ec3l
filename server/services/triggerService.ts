import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type {
  WorkflowTrigger,
  InsertWorkflowTrigger,
  WorkflowExecutionIntent,
} from "@shared/schema";

export class TriggerServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "TriggerServiceError";
    this.statusCode = statusCode;
  }
}

export async function createTrigger(
  ctx: TenantContext,
  data: Omit<InsertWorkflowTrigger, "tenantId">,
): Promise<WorkflowTrigger> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(data.workflowDefinitionId);
  if (!wf) {
    throw new TriggerServiceError("Workflow definition not found", 404);
  }

  if (data.triggerType === "record_event") {
    const config = data.triggerConfig as Record<string, unknown> | null;
    if (!config || typeof config.recordType !== "string" || !config.recordType) {
      throw new TriggerServiceError("record_event triggers require triggerConfig.recordType");
    }
  }

  if (data.triggerType === "schedule") {
    const config = data.triggerConfig as Record<string, unknown> | null;
    if (!config || (!config.cron && !config.interval)) {
      throw new TriggerServiceError("schedule triggers require triggerConfig.cron or triggerConfig.interval");
    }
  }

  return ts.createWorkflowTrigger({
    ...data,
    tenantId: ctx.tenantId,
  });
}

export async function getTriggersByTenant(
  ctx: TenantContext,
): Promise<WorkflowTrigger[]> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkflowTriggersByTenant();
}

export async function getTrigger(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowTrigger | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkflowTrigger(id);
}

export async function getTriggersByDefinition(
  ctx: TenantContext,
  workflowDefinitionId: string,
): Promise<WorkflowTrigger[]> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new TriggerServiceError("Workflow definition not found", 404);
  }
  return ts.getWorkflowTriggersByDefinition(workflowDefinitionId);
}

export async function disableTrigger(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowTrigger> {
  const ts = getTenantStorage(ctx);
  const trigger = await ts.getWorkflowTrigger(id);
  if (!trigger) {
    throw new TriggerServiceError("Trigger not found", 404);
  }
  const updated = await ts.updateWorkflowTriggerStatus(id, "disabled");
  return updated!;
}

export async function enableTrigger(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowTrigger> {
  const ts = getTenantStorage(ctx);
  const trigger = await ts.getWorkflowTrigger(id);
  if (!trigger) {
    throw new TriggerServiceError("Trigger not found", 404);
  }
  const updated = await ts.updateWorkflowTriggerStatus(id, "active");
  return updated!;
}

export async function fireManualTrigger(
  ctx: TenantContext,
  triggerId: string,
  payload: Record<string, unknown> = {},
): Promise<WorkflowExecutionIntent> {
  const ts = getTenantStorage(ctx);
  const trigger = await ts.getWorkflowTrigger(triggerId);
  if (!trigger) {
    throw new TriggerServiceError("Trigger not found", 404);
  }
  if (trigger.triggerType !== "manual") {
    throw new TriggerServiceError("Only manual triggers can be fired via this endpoint");
  }
  if (trigger.status !== "active") {
    throw new TriggerServiceError("Trigger is disabled");
  }

  const wf = await ts.getWorkflowDefinition(trigger.workflowDefinitionId);
  if (!wf || wf.status !== "active") {
    throw new TriggerServiceError("Workflow definition is not active");
  }

  const firedAt = new Date().toISOString();
  const idempotencyKey = `manual:${trigger.id}:${trigger.workflowDefinitionId}:${firedAt}`;

  return ts.createWorkflowExecutionIntent({
    tenantId: ctx.tenantId,
    workflowDefinitionId: trigger.workflowDefinitionId,
    triggerType: "manual",
    triggerPayload: { ...payload, triggerId: trigger.id, firedBy: "api", firedAt },
    idempotencyKey,
  });
}

export async function emitRecordEvent(
  ctx: TenantContext,
  event: string,
  recordType: string,
  recordData: Record<string, unknown>,
): Promise<WorkflowExecutionIntent[]> {
  const ts = getTenantStorage(ctx);
  const supportedEvents = ["record.created", "record.updated"];
  if (!supportedEvents.includes(event)) {
    throw new TriggerServiceError(`Unsupported record event: ${event}. Supported: ${supportedEvents.join(", ")}`);
  }

  const activeTriggers = await ts.getActiveTriggersByTenantAndType("record_event");

  const matchedIntents: WorkflowExecutionIntent[] = [];

  for (const trigger of activeTriggers) {
    const config = trigger.triggerConfig as Record<string, unknown> | null;
    if (!config) continue;

    if (config.recordType !== recordType) continue;

    if (config.fieldConditions && typeof config.fieldConditions === "object") {
      const conditions = config.fieldConditions as Record<string, unknown>;
      let match = true;
      for (const [field, expected] of Object.entries(conditions)) {
        if (recordData[field] !== expected) {
          match = false;
          break;
        }
      }
      if (!match) continue;
    }

    const wf = await ts.getWorkflowDefinition(trigger.workflowDefinitionId);
    if (!wf || wf.status !== "active") continue;

    const matchedAt = new Date().toISOString();
    const recordDataKey = JSON.stringify(recordData, Object.keys(recordData).sort());
    const idempotencyKey = `record_event:${trigger.id}:${trigger.workflowDefinitionId}:${event}:${recordType}:${recordDataKey}`;

    const intent = await ts.createWorkflowExecutionIntent({
      tenantId: ctx.tenantId,
      workflowDefinitionId: trigger.workflowDefinitionId,
      triggerType: "record_event",
      triggerPayload: {
        triggerId: trigger.id,
        event,
        recordType,
        recordData,
        matchedAt,
      },
      idempotencyKey,
    });

    matchedIntents.push(intent);
  }

  return matchedIntents;
}
