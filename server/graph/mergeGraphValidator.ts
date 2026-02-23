import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangePatchOp } from "@shared/schema";
import type { CachedRecordType, RecordTypeSchema } from "../executors/patchOpExecutor";
import type {
  GraphSnapshot,
  RecordTypeNode,
  FieldDefinitionNode,
  EdgeDefinition,
  GraphValidationError,
} from "./graphContracts";
import { validateGraphSnapshot } from "./graphValidationService";

const RECORD_TYPE_OPS = ["set_field", "add_field", "remove_field", "rename_field"];

export interface ProjectedSnapshotResult {
  current: GraphSnapshot;
  projected: GraphSnapshot;
}

export interface GraphMergeValidationResult {
  errors: GraphValidationError[];
  current: GraphSnapshot;
  projected: GraphSnapshot;
}

/**
 * Build both the current and projected graph snapshots for a set of pending ops.
 *
 * Loads ALL record types in the tenant, builds the current snapshot from raw data,
 * then simulates field-level changes from pending ops to produce the projected snapshot.
 * Returns both snapshots so callers can diff or validate independently.
 */
export async function buildProjectedSnapshot(
  ctx: TenantContext,
  ops: ChangePatchOp[],
  changeProjectId: string,
): Promise<ProjectedSnapshotResult> {
  const ts = getTenantStorage(ctx);

  // Load all record types in the tenant (not just project-scoped) so the
  // cross-project baseType validator can distinguish orphan from cross-project.
  const allRecordTypes = await ts.listRecordTypes();

  const projectRecordTypes = allRecordTypes.filter(
    (rt) => rt.projectId === changeProjectId,
  );

  // --- Build current snapshot (before ops) ---
  const currentNodes: RecordTypeNode[] = [];
  const currentFields: FieldDefinitionNode[] = [];
  const currentEdges: EdgeDefinition[] = [];

  // Also seed projected field maps and baseType maps in the same pass
  const projectedBaseTypes = new Map<string, string | null>();
  for (const rt of projectRecordTypes) {
    projectedBaseTypes.set(rt.key, rt.baseType);
  }

  const projectedFieldMaps = new Map<string, Map<string, { type: string; required: boolean }>>();

  for (const rt of allRecordTypes) {
    // Current node
    currentNodes.push({
      id: rt.id,
      type: "record_type",
      tenantId: ctx.tenantId,
      version: rt.version,
      key: rt.key,
      baseType: rt.baseType,
      status: rt.status,
      projectId: rt.projectId,
    });

    if (rt.baseType) {
      currentEdges.push({
        fromType: rt.key,
        toType: rt.baseType,
        relationship: "inherits",
        cardinality: "one-to-one",
      });
    }

    // Current fields + seed projected field map
    const schema = rt.schema as { fields?: Array<{ name: string; type: string; required?: boolean }> } | null;
    const fieldMap = new Map<string, { type: string; required: boolean }>();
    if (schema?.fields && Array.isArray(schema.fields)) {
      for (const f of schema.fields) {
        currentFields.push({
          recordTypeKey: rt.key,
          name: f.name,
          fieldType: f.type,
          required: f.required === true,
        });
        fieldMap.set(f.name, { type: f.type, required: f.required === true });
      }
    }
    projectedFieldMaps.set(rt.key, fieldMap);
  }

  const builtAt = new Date().toISOString();
  const emptyBindings = {
    workflows: [] as GraphSnapshot["bindings"]["workflows"],
    slas: [] as GraphSnapshot["bindings"]["slas"],
    assignments: [] as GraphSnapshot["bindings"]["assignments"],
    changePolicies: [] as GraphSnapshot["bindings"]["changePolicies"],
  };

  const current: GraphSnapshot = {
    tenantId: ctx.tenantId,
    builtAt,
    nodes: currentNodes,
    fields: currentFields,
    edges: currentEdges,
    bindings: emptyBindings,
  };

  // --- Apply pending ops to projected field maps ---
  for (const op of ops) {
    if (!RECORD_TYPE_OPS.includes(op.opType)) continue;
    const payload = op.payload as Record<string, unknown>;
    const rtKey = (payload.recordType as string) || "";
    const fieldMap = projectedFieldMaps.get(rtKey);
    if (!fieldMap) continue;

    switch (op.opType) {
      case "add_field":
      case "set_field": {
        const fieldName = payload.field as string;
        const def = payload.definition as { type: string; required?: boolean } | undefined;
        if (fieldName && def) {
          fieldMap.set(fieldName, { type: def.type, required: def.required === true });
        }
        break;
      }
      case "remove_field": {
        const fieldName = payload.field as string;
        if (fieldName) {
          fieldMap.delete(fieldName);
        }
        break;
      }
      case "rename_field": {
        const oldName = payload.oldName as string;
        const newName = payload.newName as string;
        if (oldName && newName) {
          const existing = fieldMap.get(oldName);
          if (existing) {
            fieldMap.delete(oldName);
            fieldMap.set(newName, existing);
          }
        }
        break;
      }
    }
  }

  // --- Build projected snapshot from projected state ---
  const projectedNodes: RecordTypeNode[] = [];
  const projectedFields: FieldDefinitionNode[] = [];
  const projectedEdges: EdgeDefinition[] = [];

  for (const rt of allRecordTypes) {
    const baseType = projectedBaseTypes.get(rt.key) ?? rt.baseType;

    projectedNodes.push({
      id: rt.id,
      type: "record_type",
      tenantId: ctx.tenantId,
      version: rt.version,
      key: rt.key,
      baseType,
      status: rt.status,
      projectId: rt.projectId,
    });

    if (baseType) {
      projectedEdges.push({
        fromType: rt.key,
        toType: baseType,
        relationship: "inherits",
        cardinality: "one-to-one",
      });
    }

    const fieldMap = projectedFieldMaps.get(rt.key);
    if (fieldMap) {
      for (const [name, def] of fieldMap) {
        projectedFields.push({
          recordTypeKey: rt.key,
          name,
          fieldType: def.type,
          required: def.required,
        });
      }
    }
  }

  const projected: GraphSnapshot = {
    tenantId: ctx.tenantId,
    builtAt,
    nodes: projectedNodes,
    fields: projectedFields,
    edges: projectedEdges,
    bindings: emptyBindings,
  };

  return { current, projected };
}

/**
 * Build a projected graph snapshot, validate it, and return both snapshots + errors.
 *
 * This is the bridge between the executor cache (Phase 1 output) and
 * the pure graph validation layer. Returns validation errors plus both
 * snapshots so the caller can compute diffs without a second DB round-trip.
 */
export async function validateGraphForMerge(
  ctx: TenantContext,
  cache: Map<string, CachedRecordType>,
  ops: ChangePatchOp[],
  changeProjectId: string,
): Promise<GraphMergeValidationResult> {
  const { current, projected } = await buildProjectedSnapshot(ctx, ops, changeProjectId);
  const errors = validateGraphSnapshot(projected);
  return { errors, current, projected };
}
