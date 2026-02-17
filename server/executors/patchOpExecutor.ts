import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangePatchOp, ChangeTarget } from "@shared/schema";

export class PatchOpExecutionError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PatchOpExecutionError";
    this.statusCode = statusCode;
  }
}

interface FieldDefinition {
  name: string;
  type: string;
  required?: boolean;
  [key: string]: unknown;
}

interface RecordTypeSchema {
  fields: FieldDefinition[];
  [key: string]: unknown;
}

interface SetFieldPayload {
  recordType: string;
  field: string;
  definition: { type: string; [key: string]: unknown };
}

interface AppliedOp {
  patchOpId: string;
  recordTypeId: string;
  recordTypeKey: string;
  previousSchema: unknown;
}

function logExec(changeId: string, message: string): void {
  console.log(`[patch-op-executor] change=${changeId} ${message}`);
}

async function resolveBaseTypeFields(
  ts: ReturnType<typeof getTenantStorage>,
  baseTypeKey: string | null,
): Promise<FieldDefinition[]> {
  if (!baseTypeKey) return [];
  const baseRt = await ts.getRecordTypeByKey(baseTypeKey);
  if (!baseRt) return [];
  const schema = baseRt.schema as RecordTypeSchema | null;
  if (!schema || !Array.isArray(schema.fields)) return [];
  return schema.fields.filter((f) => f.required === true);
}

async function ensureSnapshot(
  ts: ReturnType<typeof getTenantStorage>,
  changeId: string,
  recordTypeKey: string,
  projectId: string,
  schema: unknown,
  snapshotted: Set<string>,
): Promise<void> {
  if (snapshotted.has(recordTypeKey)) return;
  const existing = await ts.getSnapshotByChangeAndKey(changeId, recordTypeKey);
  if (existing) {
    snapshotted.add(recordTypeKey);
    return;
  }
  await ts.createRecordTypeSnapshot({
    tenantId: "", // overridden by storage
    projectId,
    recordTypeKey,
    changeId,
    schema: schema ?? { fields: [] },
  });
  snapshotted.add(recordTypeKey);
}

async function executeSetField(
  ts: ReturnType<typeof getTenantStorage>,
  op: ChangePatchOp,
  changeId: string,
  snapshotted: Set<string>,
): Promise<AppliedOp> {
  const payload = op.payload as unknown as SetFieldPayload;

  const rt = await ts.getRecordTypeByKey(payload.recordType);
  if (!rt) {
    throw new PatchOpExecutionError(
      `Record type "${payload.recordType}" not found`,
      404,
    );
  }

  const previousSchema = rt.schema ?? { fields: [] };

  // Snapshot once per recordType per change
  await ensureSnapshot(
    ts,
    changeId,
    payload.recordType,
    rt.projectId!,
    previousSchema,
    snapshotted,
  );

  const schema = (
    rt.schema && typeof rt.schema === "object" ? { ...rt.schema as object } : { fields: [] }
  ) as RecordTypeSchema;

  if (!Array.isArray(schema.fields)) {
    schema.fields = [];
  }

  // Protect required baseType fields from being removed or having required=false
  if (rt.baseType) {
    const requiredBaseFields = await resolveBaseTypeFields(ts, rt.baseType);
    const baseFieldNames = new Set(requiredBaseFields.map((f) => f.name));
    if (baseFieldNames.has(payload.field)) {
      const def = payload.definition;
      if (def.required === false) {
        throw new PatchOpExecutionError(
          `Cannot weaken required baseType field "${payload.field}" inherited from "${rt.baseType}"`,
          400,
        );
      }
    }
  }

  const existingIndex = schema.fields.findIndex(
    (f) => f.name === payload.field,
  );

  if (existingIndex >= 0) {
    schema.fields[existingIndex] = {
      name: payload.field,
      ...payload.definition,
    };
  } else {
    schema.fields.push({
      name: payload.field,
      ...payload.definition,
    });
  }

  const updated = await ts.updateRecordTypeSchema(rt.id, schema);
  if (!updated) {
    throw new PatchOpExecutionError(
      `Failed to update record type "${payload.recordType}"`,
      500,
    );
  }

  await ts.updateChangePatchOpSnapshot(op.id, previousSchema);

  logExec(changeId, `applied set_field "${payload.field}" on "${payload.recordType}" (op=${op.id})`);

  return {
    patchOpId: op.id,
    recordTypeId: rt.id,
    recordTypeKey: payload.recordType,
    previousSchema,
  };
}

async function rollback(
  ts: ReturnType<typeof getTenantStorage>,
  applied: AppliedOp[],
  changeId: string,
): Promise<void> {
  for (let i = applied.length - 1; i >= 0; i--) {
    const { recordTypeId, recordTypeKey, previousSchema } = applied[i];
    await ts.updateRecordTypeSchema(recordTypeId, previousSchema);
    logExec(changeId, `rollback "${recordTypeKey}" (rt=${recordTypeId})`);
  }
}

export interface ExecutionResult {
  success: boolean;
  appliedCount: number;
  error?: string;
}

export async function executeChange(
  ctx: TenantContext,
  changeId: string,
): Promise<ExecutionResult> {
  const ts = getTenantStorage(ctx);

  // Guard: change must exist and be in Implementing state
  const change = await ts.getChange(changeId);
  if (!change) {
    throw new PatchOpExecutionError("Change not found", 404);
  }
  if (change.status !== "Implementing") {
    throw new PatchOpExecutionError(
      `Change must be in "Implementing" state, got "${change.status}"`,
      409,
    );
  }

  const ops = await ts.getChangePatchOpsByChange(changeId);
  if (ops.length === 0) {
    throw new PatchOpExecutionError(
      "No patch ops to execute for this change",
      400,
    );
  }

  logExec(changeId, `executing ${ops.length} patch op(s)`);

  // Track which recordType keys have been snapshotted for dedup
  const snapshotted = new Set<string>();
  const applied: AppliedOp[] = [];

  for (const op of ops) {
    try {
      if (op.opType === "set_field") {
        // Verify target is record_type
        const target: ChangeTarget | undefined = await ts.getChangeTarget(op.targetId);
        if (!target || target.type !== "record_type") {
          throw new PatchOpExecutionError(
            `Patch op ${op.id} target must be type "record_type"`,
            400,
          );
        }
        const result = await executeSetField(ts, op, changeId, snapshotted);
        applied.push(result);
      }
      // Other opTypes can be added here in the future
    } catch (err) {
      logExec(changeId, `FAILED at op ${op.id} (${op.opType}): ${err instanceof Error ? err.message : "unknown"}`);
      await rollback(ts, applied, changeId);
      const message =
        err instanceof Error ? err.message : "Unknown execution error";
      return {
        success: false,
        appliedCount: 0,
        error: `Patch op ${op.id} (${op.opType}) failed: ${message}`,
      };
    }
  }

  logExec(changeId, `completed — ${applied.length} op(s) applied`);
  return { success: true, appliedCount: applied.length };
}

// Keep backward-compatible alias
export const executePatchOps = executeChange;
