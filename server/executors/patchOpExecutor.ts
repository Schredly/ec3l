import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangePatchOp } from "@shared/schema";

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
  previousSchema: unknown;
}

async function executeSetField(
  ts: ReturnType<typeof getTenantStorage>,
  op: ChangePatchOp,
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
  const schema = (
    rt.schema && typeof rt.schema === "object" ? { ...rt.schema as object } : { fields: [] }
  ) as RecordTypeSchema;

  if (!Array.isArray(schema.fields)) {
    schema.fields = [];
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

  return {
    patchOpId: op.id,
    recordTypeId: rt.id,
    previousSchema,
  };
}

async function rollback(
  ts: ReturnType<typeof getTenantStorage>,
  applied: AppliedOp[],
): Promise<void> {
  for (let i = applied.length - 1; i >= 0; i--) {
    const { recordTypeId, previousSchema } = applied[i];
    await ts.updateRecordTypeSchema(recordTypeId, previousSchema);
  }
}

export interface ExecutionResult {
  success: boolean;
  appliedCount: number;
  error?: string;
}

export async function executePatchOps(
  ctx: TenantContext,
  changeId: string,
): Promise<ExecutionResult> {
  const ts = getTenantStorage(ctx);

  const ops = await ts.getChangePatchOpsByChange(changeId);
  if (ops.length === 0) {
    return { success: true, appliedCount: 0 };
  }

  const applied: AppliedOp[] = [];

  for (const op of ops) {
    try {
      if (op.opType === "set_field") {
        const result = await executeSetField(ts, op);
        applied.push(result);
      }
      // Other opTypes can be added here in the future
    } catch (err) {
      await rollback(ts, applied);
      const message =
        err instanceof Error ? err.message : "Unknown execution error";
      return {
        success: false,
        appliedCount: 0,
        error: `Patch op ${op.id} (${op.opType}) failed: ${message}`,
      };
    }
  }

  return { success: true, appliedCount: applied.length };
}
