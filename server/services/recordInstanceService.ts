import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import type { RecordInstance } from "@shared/schema";
import { emitTelemetry, buildTelemetryParams } from "./telemetryService";

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

  const instance = await storage.createRecordInstance({
    tenantId: ctx.tenantId,
    recordTypeId: data.recordTypeId,
    data: data.data,
    createdBy,
  });

  emitTelemetry(buildTelemetryParams(ctx, {
    eventType: "execution_completed",
    executionType: "task",
    executionId: instance.id,
    status: "created",
  }));

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

  emitTelemetry(buildTelemetryParams(ctx, {
    eventType: "execution_completed",
    executionType: "task",
    executionId: id,
    status: "updated",
  }));

  return updated;
}
