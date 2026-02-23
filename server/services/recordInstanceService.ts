import type { TenantContext } from "../tenant";
import { storage, type RecordInstanceWithSla } from "../storage";
import type { RecordInstance } from "@shared/schema";
import { emitDomainEvent } from "./domainEventService";
import { emitRecordEvent } from "./triggerService";
import { resolveAssignment } from "./assignmentService";

export class RecordInstanceServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RecordInstanceServiceError";
    this.statusCode = statusCode;
  }
}

export async function createRecordInstance(
  ctx: TenantContext,
  data: {
    recordTypeId: string;
    data: Record<string, unknown>;
  },
): Promise<RecordInstance> {
  const rt = await storage.getRecordType(data.recordTypeId);
  if (!rt || rt.tenantId !== ctx.tenantId) {
    throw new RecordInstanceServiceError("Record type not found", 404);
  }

  const createdBy = ctx.userId ?? ctx.agentId ?? "system";
  const assignment = resolveAssignment(rt, data.data);

  const instance = await storage.createRecordInstance({
    tenantId: ctx.tenantId,
    recordTypeId: data.recordTypeId,
    data: data.data,
    createdBy,
    ...(assignment?.assignedTo && { assignedTo: assignment.assignedTo }),
    ...(assignment?.assignedGroup && { assignedGroup: assignment.assignedGroup }),
  });

  emitDomainEvent(ctx, {
    type: "execution_completed",
    status: "created",
    entityId: instance.id,
  });

  if (assignment) {
    emitDomainEvent(ctx, {
      type: "record.assigned",
      status: "assigned",
      entityId: instance.id,
      affectedRecords: {
        recordId: instance.id,
        assignedTo: assignment.assignedTo ?? null,
        assignedGroup: assignment.assignedGroup ?? null,
      },
    });
  }

  // SLA timer creation
  const slaConfig = rt.slaConfig as { durationMinutes?: number } | null;
  if (slaConfig?.durationMinutes && slaConfig.durationMinutes > 0) {
    const dueAt = new Date(Date.now() + slaConfig.durationMinutes * 60_000);
    storage.createRecordTimer({
      tenantId: ctx.tenantId,
      recordId: instance.id,
      type: "sla_due",
      dueAt,
    }).then(() => {
      emitDomainEvent(ctx, {
        type: "record.sla.created",
        status: "timer_created",
        entityId: instance.id,
        affectedRecords: { recordId: instance.id, dueAt: dueAt.toISOString() },
      });
    }).catch(() => {});
  }

  emitRecordEvent(ctx, "record.created", rt.key, data.data).catch(() => {});

  return instance;
}

export async function getRecordInstance(
  ctx: TenantContext,
  id: string,
): Promise<RecordInstance | undefined> {
  return storage.getRecordInstance(id, ctx.tenantId);
}

export async function listRecordInstances(
  ctx: TenantContext,
  recordTypeId: string,
): Promise<RecordInstance[]> {
  return storage.listRecordInstancesByRecordType(ctx.tenantId, recordTypeId);
}

export async function listRecordInstancesWithSla(
  ctx: TenantContext,
  recordTypeId: string,
): Promise<RecordInstanceWithSla[]> {
  return storage.listRecordInstancesWithSla(ctx.tenantId, recordTypeId);
}

export async function updateRecordInstance(
  ctx: TenantContext,
  id: string,
  data: Record<string, unknown>,
): Promise<RecordInstance> {
  const existing = await storage.getRecordInstance(id, ctx.tenantId);
  if (!existing) {
    throw new RecordInstanceServiceError("Record instance not found", 404);
  }

  const updated = await storage.updateRecordInstance(id, ctx.tenantId, { data });
  if (!updated) {
    throw new RecordInstanceServiceError("Record instance not found", 404);
  }

  emitDomainEvent(ctx, {
    type: "execution_completed",
    status: "updated",
    entityId: id,
  });

  const rt = await storage.getRecordType(existing.recordTypeId);
  if (rt) {
    emitRecordEvent(ctx, "record.updated", rt.key, data).catch(() => {});
  }

  return updated;
}
