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

export interface FieldDefinition {
  name: string;
  type: string;
  required?: boolean;
  [key: string]: unknown;
}

export interface RecordTypeSchema {
  fields: FieldDefinition[];
  [key: string]: unknown;
}

interface SetFieldPayload {
  recordType: string;
  field: string;
  definition: { type: string; [key: string]: unknown };
}

interface AddFieldPayload {
  recordType: string;
  field: string;
  definition: { type: string; [key: string]: unknown };
}

interface RemoveFieldPayload {
  recordType: string;
  field: string;
}

interface RenameFieldPayload {
  recordType: string;
  oldName: string;
  newName: string;
}

const RECORD_TYPE_OPS = ["set_field", "add_field", "remove_field", "rename_field"];

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

// --- Pure transform functions ---

function normalizeSchema(raw: unknown): RecordTypeSchema {
  if (raw && typeof raw === "object") {
    const schema = { ...(raw as object) } as RecordTypeSchema;
    if (!Array.isArray(schema.fields)) schema.fields = [];
    return schema;
  }
  return { fields: [] };
}

export function applySetField(
  schema: RecordTypeSchema,
  payload: SetFieldPayload,
  protectedFields: Set<string>,
): RecordTypeSchema {
  if (protectedFields.has(payload.field)) {
    if (payload.definition.required === false) {
      throw new PatchOpExecutionError(
        `Cannot weaken required baseType field "${payload.field}"`,
      );
    }
  }

  const fields = [...schema.fields];
  const existingIndex = fields.findIndex((f) => f.name === payload.field);

  if (existingIndex >= 0) {
    fields[existingIndex] = { name: payload.field, ...payload.definition };
  } else {
    fields.push({ name: payload.field, ...payload.definition });
  }

  return { ...schema, fields };
}

export function applyAddField(
  schema: RecordTypeSchema,
  payload: AddFieldPayload,
): RecordTypeSchema {
  const exists = schema.fields.some((f) => f.name === payload.field);
  if (exists) {
    throw new PatchOpExecutionError(`Field already exists: "${payload.field}"`);
  }

  return {
    ...schema,
    fields: [...schema.fields, { name: payload.field, ...payload.definition }],
  };
}

export function applyRemoveField(
  schema: RecordTypeSchema,
  payload: RemoveFieldPayload,
  protectedFields: Set<string>,
): RecordTypeSchema {
  if (protectedFields.has(payload.field)) {
    throw new PatchOpExecutionError(
      `Cannot remove required baseType field "${payload.field}"`,
    );
  }

  const exists = schema.fields.some((f) => f.name === payload.field);
  if (!exists) {
    throw new PatchOpExecutionError(`Field does not exist: "${payload.field}"`);
  }

  return {
    ...schema,
    fields: schema.fields.filter((f) => f.name !== payload.field),
  };
}

export function applyRenameField(
  schema: RecordTypeSchema,
  payload: RenameFieldPayload,
  protectedFields: Set<string>,
): RecordTypeSchema {
  if (protectedFields.has(payload.oldName)) {
    throw new PatchOpExecutionError(
      `Cannot rename required baseType field "${payload.oldName}"`,
    );
  }

  const oldIndex = schema.fields.findIndex((f) => f.name === payload.oldName);
  if (oldIndex < 0) {
    throw new PatchOpExecutionError(`Field does not exist: "${payload.oldName}"`);
  }

  const newExists = schema.fields.some((f) => f.name === payload.newName);
  if (newExists) {
    throw new PatchOpExecutionError(`Field already exists: "${payload.newName}"`);
  }

  const fields = [...schema.fields];
  fields[oldIndex] = { ...fields[oldIndex], name: payload.newName };

  return { ...schema, fields };
}

// --- Execution ---

export interface ExecutionResult {
  success: boolean;
  appliedCount: number;
  error?: string;
}

interface CachedRecordType {
  rt: { id: string; projectId: string; baseType: string | null; [key: string]: unknown };
  originalSchema: RecordTypeSchema;
  currentSchema: RecordTypeSchema;
  protectedFields: Set<string>;
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

  // --- Phase 1: Load ---
  // Cache record types by key; validates targets upfront
  const cache = new Map<string, CachedRecordType>();

  for (const op of ops) {
    if (!RECORD_TYPE_OPS.includes(op.opType)) continue;

    const target: ChangeTarget | undefined = await ts.getChangeTarget(op.targetId);
    if (!target || target.type !== "record_type") {
      throw new PatchOpExecutionError(
        `Patch op ${op.id} target must be type "record_type"`,
        400,
      );
    }

    const payload = op.payload as Record<string, unknown>;
    const recordTypeKey = (payload.recordType as string) || "";

    if (!cache.has(recordTypeKey)) {
      const rt = await ts.getRecordTypeByKey(recordTypeKey);
      if (!rt) {
        return {
          success: false,
          appliedCount: 0,
          error: `Patch op ${op.id} (${op.opType}) failed: Record type "${recordTypeKey}" not found`,
        };
      }

      const schema = normalizeSchema(rt.schema);
      const baseFields = await resolveBaseTypeFields(ts, rt.baseType);
      const protectedFields = new Set(baseFields.map((f) => f.name));

      cache.set(recordTypeKey, {
        rt: rt as CachedRecordType["rt"],
        originalSchema: schema,
        currentSchema: schema,
        protectedFields,
      });
    }
  }

  // --- Phase 2: Transform (in memory) ---
  // Track per-op previous schemas for snapshot stamping
  const opSnapshots: Array<{ op: ChangePatchOp; previousSchema: RecordTypeSchema; recordTypeKey: string }> = [];

  for (const op of ops) {
    if (!RECORD_TYPE_OPS.includes(op.opType)) continue;

    const payload = op.payload as Record<string, unknown>;
    const recordTypeKey = (payload.recordType as string) || "";
    const entry = cache.get(recordTypeKey)!;
    const previousSchema = entry.currentSchema;

    try {
      let nextSchema: RecordTypeSchema;

      switch (op.opType) {
        case "set_field":
          nextSchema = applySetField(
            entry.currentSchema,
            payload as unknown as SetFieldPayload,
            entry.protectedFields,
          );
          break;
        case "add_field":
          nextSchema = applyAddField(
            entry.currentSchema,
            payload as unknown as AddFieldPayload,
          );
          break;
        case "remove_field":
          nextSchema = applyRemoveField(
            entry.currentSchema,
            payload as unknown as RemoveFieldPayload,
            entry.protectedFields,
          );
          break;
        case "rename_field":
          nextSchema = applyRenameField(
            entry.currentSchema,
            payload as unknown as RenameFieldPayload,
            entry.protectedFields,
          );
          break;
        default:
          throw new PatchOpExecutionError(`Unknown record type op: "${op.opType}"`);
      }

      entry.currentSchema = nextSchema;
      opSnapshots.push({ op, previousSchema, recordTypeKey });
    } catch (err) {
      logExec(changeId, `FAILED at op ${op.id} (${op.opType}): ${err instanceof Error ? err.message : "unknown"}`);
      const message = err instanceof Error ? err.message : "Unknown execution error";
      return {
        success: false,
        appliedCount: 0,
        error: `Patch op ${op.id} (${op.opType}) failed: ${message}`,
      };
    }
  }

  // --- Phase 3: Persist ---
  const snapshotted = new Set<string>();

  const cacheKeys = Array.from(cache.keys());
  for (const recordTypeKey of cacheKeys) {
    const entry = cache.get(recordTypeKey)!;
    // Only persist if schema actually changed
    if (entry.currentSchema === entry.originalSchema) continue;

    await ensureSnapshot(
      ts,
      changeId,
      recordTypeKey,
      entry.rt.projectId!,
      entry.originalSchema,
      snapshotted,
    );

    const updated = await ts.updateRecordTypeSchema(entry.rt.id, entry.currentSchema);
    if (!updated) {
      throw new PatchOpExecutionError(
        `Failed to update record type "${recordTypeKey}"`,
        500,
      );
    }
  }

  for (const { op, previousSchema, recordTypeKey } of opSnapshots) {
    await ts.updateChangePatchOpSnapshot(op.id, previousSchema);
    logExec(changeId, `applied ${op.opType} on "${recordTypeKey}" (op=${op.id})`);
  }

  logExec(changeId, `completed — ${opSnapshots.length} op(s) applied`);
  return { success: true, appliedCount: opSnapshots.length };
}

// Keep backward-compatible alias
export const executePatchOps = executeChange;
