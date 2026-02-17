import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangePatchOp } from "@shared/schema";

export class PatchOpServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PatchOpServiceError";
    this.statusCode = statusCode;
  }
}

function validateSetFieldPayload(payload: Record<string, unknown>): void {
  if (!payload.recordType || typeof payload.recordType !== "string") {
    throw new PatchOpServiceError('set_field payload requires a string "recordType"');
  }
  if (!payload.field || typeof payload.field !== "string") {
    throw new PatchOpServiceError('set_field payload requires a string "field"');
  }
  if (!payload.definition || typeof payload.definition !== "object" || Array.isArray(payload.definition)) {
    throw new PatchOpServiceError('set_field payload requires an object "definition"');
  }
  const def = payload.definition as Record<string, unknown>;
  if (!def.type || typeof def.type !== "string") {
    throw new PatchOpServiceError('set_field definition requires a string "type"');
  }
}

export async function createPatchOp(
  ctx: TenantContext,
  changeId: string,
  targetId: string,
  opType: string,
  payload: unknown,
): Promise<ChangePatchOp> {
  const ts = getTenantStorage(ctx);

  const change = await ts.getChange(changeId);
  if (!change) {
    throw new PatchOpServiceError("Change not found", 404);
  }

  const target = await ts.getChangeTarget(targetId);
  if (!target) {
    throw new PatchOpServiceError("Change target not found", 404);
  }

  if (target.changeId !== changeId) {
    throw new PatchOpServiceError("Target does not belong to this change", 400);
  }

  const p = (payload ?? {}) as Record<string, unknown>;

  if (opType === "edit_file") {
    if (target.type !== "file") {
      throw new PatchOpServiceError(
        'edit_file operations require a target of type "file"',
        400,
      );
    }
  }

  if (opType === "set_field") {
    if (target.type !== "record_type") {
      throw new PatchOpServiceError(
        'set_field operations require a target of type "record_type"',
        400,
      );
    }
    validateSetFieldPayload(p);
    const rt = await ts.getRecordTypeByKey(p.recordType as string);
    if (!rt) {
      throw new PatchOpServiceError(
        `Record type "${p.recordType}" not found`,
        404,
      );
    }
  }

  return ts.createChangePatchOp({
    tenantId: ctx.tenantId,
    changeId,
    targetId,
    opType,
    payload: p,
  });
}

export async function listPatchOps(
  ctx: TenantContext,
  changeId: string,
): Promise<ChangePatchOp[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangePatchOpsByChange(changeId);
}
