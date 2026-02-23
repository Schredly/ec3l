import type { GraphPackage } from "../graph/installGraphService";

export class DraftPatchOpError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DraftPatchOpError";
    this.statusCode = statusCode;
  }
}

export type DraftPatchOp =
  | { op: "add_field"; recordTypeKey: string; field: { name: string; type: string } }
  | { op: "rename_field"; recordTypeKey: string; from: string; to: string }
  | { op: "remove_field"; recordTypeKey: string; fieldName: string }
  | { op: "set_sla"; recordTypeKey: string; durationMinutes: number }
  | { op: "set_assignment_group"; recordTypeKey: string; groupKey: string };

/**
 * Pure function — applies a list of patch ops to a GraphPackage and returns
 * a new package. Never mutates the input.
 */
export function applyPatchOpsToPackage(pkg: GraphPackage, ops: DraftPatchOp[]): GraphPackage {
  const result = structuredClone(pkg);

  for (const op of ops) {
    switch (op.op) {
      case "add_field": {
        const rt = result.recordTypes.find((r) => r.key === op.recordTypeKey);
        if (!rt) throw new DraftPatchOpError(`Record type "${op.recordTypeKey}" not found in package`);
        if (rt.fields.some((f) => f.name === op.field.name)) {
          throw new DraftPatchOpError(`Field "${op.field.name}" already exists on "${op.recordTypeKey}"`);
        }
        rt.fields.push({ name: op.field.name, type: op.field.type });
        break;
      }

      case "rename_field": {
        const rt = result.recordTypes.find((r) => r.key === op.recordTypeKey);
        if (!rt) throw new DraftPatchOpError(`Record type "${op.recordTypeKey}" not found in package`);
        const field = rt.fields.find((f) => f.name === op.from);
        if (!field) throw new DraftPatchOpError(`Field "${op.from}" not found on "${op.recordTypeKey}"`);
        if (rt.fields.some((f) => f.name === op.to)) {
          throw new DraftPatchOpError(`Field "${op.to}" already exists on "${op.recordTypeKey}"`);
        }
        field.name = op.to;
        break;
      }

      case "remove_field": {
        const rt = result.recordTypes.find((r) => r.key === op.recordTypeKey);
        if (!rt) throw new DraftPatchOpError(`Record type "${op.recordTypeKey}" not found in package`);
        const idx = rt.fields.findIndex((f) => f.name === op.fieldName);
        if (idx === -1) throw new DraftPatchOpError(`Field "${op.fieldName}" not found on "${op.recordTypeKey}"`);
        if (rt.fields.length <= 1) {
          throw new DraftPatchOpError(`Cannot remove last field from "${op.recordTypeKey}"`);
        }
        rt.fields.splice(idx, 1);
        break;
      }

      case "set_sla": {
        const rt = result.recordTypes.find((r) => r.key === op.recordTypeKey);
        if (!rt) throw new DraftPatchOpError(`Record type "${op.recordTypeKey}" not found in package`);
        if (op.durationMinutes <= 0) {
          throw new DraftPatchOpError(`SLA duration must be greater than 0`);
        }
        if (!result.slaPolicies) result.slaPolicies = [];
        const existing = result.slaPolicies.find((s) => s.recordTypeKey === op.recordTypeKey);
        if (existing) {
          existing.durationMinutes = op.durationMinutes;
        } else {
          result.slaPolicies.push({ recordTypeKey: op.recordTypeKey, durationMinutes: op.durationMinutes });
        }
        break;
      }

      case "set_assignment_group": {
        const rt = result.recordTypes.find((r) => r.key === op.recordTypeKey);
        if (!rt) throw new DraftPatchOpError(`Record type "${op.recordTypeKey}" not found in package`);
        if (!result.assignmentRules) result.assignmentRules = [];
        const existing = result.assignmentRules.find((a) => a.recordTypeKey === op.recordTypeKey);
        if (existing) {
          existing.strategyType = "static_group";
          existing.config = { groupKey: op.groupKey };
        } else {
          result.assignmentRules.push({
            recordTypeKey: op.recordTypeKey,
            strategyType: "static_group",
            config: { groupKey: op.groupKey },
          });
        }
        break;
      }

      default:
        throw new DraftPatchOpError(`Unknown patch op: ${(op as { op: string }).op}`);
    }
  }

  return result;
}
