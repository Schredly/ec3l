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

const ALLOWED_FIELD_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "reference",
  "choice",
  "text",
  "date",
  "datetime",
]);

function validateFieldType(type: string, opType: string): void {
  if (!ALLOWED_FIELD_TYPES.has(type)) {
    throw new PatchOpServiceError(
      `${opType} definition.type "${type}" is invalid — allowed types: ${Array.from(ALLOWED_FIELD_TYPES).join(", ")}`,
    );
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
  validateFieldType(def.type, "set_field");
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
  validateFieldType(def.type, "add_field");
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

function getAffectedFieldKeys(op: ChangePatchOp): string[] {
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const rt = String(payload.recordType ?? "");
  switch (op.opType) {
    case "set_field":
    case "add_field":
    case "remove_field":
      return rt && payload.field ? [`${rt}::${String(payload.field)}`] : [];
    case "rename_field":
      return rt && payload.oldName
        ? [`${rt}::${String(payload.oldName)}`]
        : [];
    default:
      return [];
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

  // Control-plane invariant: PatchOps are only allowed while the change is mutable.
  // Once validating/ready/merged, the patch set must be frozen for deterministic execution.
  const MUTABLE_STATUSES: ReadonlySet<string> = new Set([
    "Draft",
    "Implementing",
    "WorkspaceRunning",
    "ValidationFailed",
  ]);
  if (!MUTABLE_STATUSES.has(change.status)) {
    throw new PatchOpServiceError(
      `Cannot add patch ops to a change in status "${change.status}"`,
      409,
    );
  }

  const target = await ts.getChangeTarget(targetId);
  if (!target) {
    throw new PatchOpServiceError("Change target not found", 404);
  }

  if (target.changeId !== changeId) {
    throw new PatchOpServiceError("Target does not belong to this change", 400);
  }

  if (target.projectId !== change.projectId) {
    throw new PatchOpServiceError(
      "Patch target must belong to same project as change",
      400,
    );
  }

  if (target.tenantId !== ctx.tenantId) {
    throw new PatchOpServiceError(
      "Cross-tenant patch target not allowed",
      400,
    );
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

    // --- Duplicate field guard ---
    const newFieldKeys = getAffectedFieldKeys({
      opType,
      payload: p,
    } as ChangePatchOp);

    const existingOps = await ts.getChangePatchOpsByChange(changeId);
    const existingKeys = new Set(existingOps.flatMap(getAffectedFieldKeys));

    for (const key of newFieldKeys) {
      if (existingKeys.has(key)) {
        const [recordType, field] = key.split("::");
        throw new PatchOpServiceError(
          `Duplicate: another pending op already targets field "${field}" on record type "${recordType}" in this change`,
          409,
        );
      }
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

export async function deletePatchOp(
  ctx: TenantContext,
  changeId: string,
  opId: string,
): Promise<ChangePatchOp> {
  const ts = getTenantStorage(ctx);

  const change = await ts.getChange(changeId);
  if (!change) {
    throw new PatchOpServiceError("Change not found", 404);
  }

  const IMMUTABLE_STATUSES: ReadonlySet<string> = new Set(["Validating", "Ready", "Merged"]);
  if (IMMUTABLE_STATUSES.has(change.status)) {
    throw new PatchOpServiceError(
      `Cannot delete ops from a change in status "${change.status}"`,
      409,
    );
  }

  const op = await ts.getChangePatchOp(opId);
  if (!op) {
    throw new PatchOpServiceError("Patch op not found", 404);
  }

  if (op.tenantId !== ctx.tenantId) {
    throw new PatchOpServiceError("Patch op not found", 404);
  }

  if (op.changeId !== changeId) {
    throw new PatchOpServiceError("Patch op does not belong to this change", 400);
  }

  if (op.executedAt) {
    throw new PatchOpServiceError("Cannot delete an executed patch op", 409);
  }

  const deleted = await ts.deleteChangePatchOp(opId);
  if (!deleted) {
    throw new PatchOpServiceError("Patch op not found", 404);
  }
  return deleted;
}

export async function listPatchOps(
  ctx: TenantContext,
  changeId: string,
): Promise<ChangePatchOp[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangePatchOpsByChange(changeId);
}
