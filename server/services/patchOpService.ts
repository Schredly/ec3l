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

const RECORD_TYPE_OPS = ["set_field", "add_field", "remove_field", "rename_field"];

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

function validateAddFieldPayload(payload: Record<string, unknown>): void {
  if (!payload.recordType || typeof payload.recordType !== "string") {
    throw new PatchOpServiceError('add_field payload requires a string "recordType"');
  }
  if (!payload.field || typeof payload.field !== "string") {
    throw new PatchOpServiceError('add_field payload requires a string "field"');
  }
  if (!payload.definition || typeof payload.definition !== "object" || Array.isArray(payload.definition)) {
    throw new PatchOpServiceError('add_field payload requires an object "definition"');
  }
  const def = payload.definition as Record<string, unknown>;
  if (!def.type || typeof def.type !== "string") {
    throw new PatchOpServiceError('add_field definition requires a string "type"');
  }
}

function validateRemoveFieldPayload(payload: Record<string, unknown>): void {
  if (!payload.recordType || typeof payload.recordType !== "string") {
    throw new PatchOpServiceError('remove_field payload requires a string "recordType"');
  }
  if (!payload.field || typeof payload.field !== "string") {
    throw new PatchOpServiceError('remove_field payload requires a string "field"');
  }
}

function validateRenameFieldPayload(payload: Record<string, unknown>): void {
  if (!payload.recordType || typeof payload.recordType !== "string") {
    throw new PatchOpServiceError('rename_field payload requires a string "recordType"');
  }
  if (!payload.oldName || typeof payload.oldName !== "string") {
    throw new PatchOpServiceError('rename_field payload requires a string "oldName"');
  }
  if (!payload.newName || typeof payload.newName !== "string") {
    throw new PatchOpServiceError('rename_field payload requires a string "newName"');
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

  if (RECORD_TYPE_OPS.includes(opType)) {
    if (target.type !== "record_type") {
      throw new PatchOpServiceError(
        `${opType} operations require a target of type "record_type"`,
        400,
      );
    }

    switch (opType) {
      case "set_field":
        validateSetFieldPayload(p);
        break;
      case "add_field":
        validateAddFieldPayload(p);
        break;
      case "remove_field":
        validateRemoveFieldPayload(p);
        break;
      case "rename_field":
        validateRenameFieldPayload(p);
        break;
    }

    const rtKey = (p.recordType as string) || "";
    const rt = await ts.getRecordTypeByKey(rtKey);
    if (!rt) {
      throw new PatchOpServiceError(
        `Record type "${rtKey}" not found`,
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
