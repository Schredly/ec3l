import type {
  GraphSnapshot,
  GraphValidationError,
  RecordTypeNode,
  FieldDefinitionNode,
} from "./graphContracts";

/**
 * Pure graph validation functions.
 * Operate on GraphSnapshot (or a subset of it).
 * Never throw — return error arrays. Caller decides what to do.
 */

/**
 * Validate that every baseType reference points to an existing record type
 * within the same tenant snapshot.
 */
export function validateNoOrphanRecordTypes(
  snapshot: GraphSnapshot,
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const keySet = new Set(snapshot.nodes.map((n) => n.key));

  for (const node of snapshot.nodes) {
    if (node.baseType && !keySet.has(node.baseType)) {
      errors.push({
        code: "ORPHAN_BASE_TYPE",
        message: `Record type "${node.key}" declares baseType "${node.baseType}" which does not exist`,
        nodeKey: node.key,
        recordTypeId: node.id,
        baseTypeKey: node.baseType,
      });
    }
  }

  return errors;
}

/**
 * Detect cycles in the baseType inheritance chain.
 * e.g. A inherits B, B inherits C, C inherits A.
 */
export function validateNoCyclesInBaseType(
  snapshot: GraphSnapshot,
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const nodeMap = new Map<string, RecordTypeNode>();
  for (const node of snapshot.nodes) {
    nodeMap.set(node.key, node);
  }

  for (const node of snapshot.nodes) {
    if (!node.baseType) continue;

    const visited = new Set<string>();
    let current: string | null = node.key;

    while (current) {
      if (visited.has(current)) {
        errors.push({
          code: "BASE_TYPE_CYCLE",
          message: `Circular inheritance detected: "${node.key}" → chain includes "${current}"`,
          nodeKey: node.key,
          recordTypeId: node.id,
          baseTypeKey: node.baseType ?? undefined,
        });
        break;
      }
      visited.add(current);
      const currentNode = nodeMap.get(current);
      current = currentNode?.baseType ?? null;
    }
  }

  return errors;
}

/**
 * Validate that no record type has duplicate field names within its schema.
 */
export function validateFieldUniquenessPerRecordType(
  fields: FieldDefinitionNode[],
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const seen = new Map<string, Set<string>>();

  for (const field of fields) {
    const rtFields = seen.get(field.recordTypeKey) ?? new Set();
    if (rtFields.has(field.name)) {
      errors.push({
        code: "DUPLICATE_FIELD",
        message: `Record type "${field.recordTypeKey}" has duplicate field "${field.name}"`,
        nodeKey: field.recordTypeKey,
        field: field.name,
        details: { fieldType: field.fieldType },
      });
    }
    rtFields.add(field.name);
    seen.set(field.recordTypeKey, rtFields);
  }

  return errors;
}

/**
 * Validate that all workflow bindings reference existing record types
 * and workflow definitions.
 */
export function validateBindingTargetsExist(
  snapshot: GraphSnapshot,
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const keySet = new Set(snapshot.nodes.map((n) => n.key));

  for (const wb of snapshot.bindings.workflows) {
    if (!keySet.has(wb.recordTypeKey)) {
      errors.push({
        code: "BINDING_TARGET_MISSING",
        message: `Workflow "${wb.workflowName}" (${wb.workflowId}) is bound to record type "${wb.recordTypeKey}" which does not exist`,
        nodeKey: wb.recordTypeKey,
      });
    }
  }

  for (const sla of snapshot.bindings.slas) {
    if (!keySet.has(sla.recordTypeKey)) {
      errors.push({
        code: "BINDING_TARGET_MISSING",
        message: `SLA binding for record type "${sla.recordTypeKey}" targets a type that does not exist`,
        nodeKey: sla.recordTypeKey,
      });
    }
  }

  for (const ab of snapshot.bindings.assignments) {
    if (!keySet.has(ab.recordTypeKey)) {
      errors.push({
        code: "BINDING_TARGET_MISSING",
        message: `Assignment binding for record type "${ab.recordTypeKey}" targets a type that does not exist`,
        nodeKey: ab.recordTypeKey,
      });
    }
  }

  return errors;
}

/**
 * Validate that every baseType reference resolves to a record type
 * in the same project. Cross-project inheritance is not allowed.
 */
export function validateBaseTypeSameProject(
  snapshot: GraphSnapshot,
): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const nodeByKey = new Map(snapshot.nodes.map((n) => [n.key, n]));

  for (const node of snapshot.nodes) {
    if (!node.baseType) continue;
    const baseNode = nodeByKey.get(node.baseType);
    if (!baseNode) continue; // orphan check handles missing base types
    if (baseNode.projectId !== node.projectId) {
      errors.push({
        code: "BASE_TYPE_CROSS_PROJECT",
        message: `Record type "${node.key}" (project "${node.projectId}") declares baseType "${node.baseType}" which belongs to project "${baseNode.projectId}"`,
        nodeKey: node.key,
        recordTypeId: node.id,
        baseTypeKey: node.baseType,
        details: {
          sourceProjectId: node.projectId,
          targetProjectId: baseNode.projectId,
        },
      });
    }
  }

  return errors;
}

/**
 * Run all graph validations on a snapshot.
 * Returns an empty array if the graph is valid.
 */
export function validateGraphSnapshot(
  snapshot: GraphSnapshot,
): GraphValidationError[] {
  return [
    ...validateNoOrphanRecordTypes(snapshot),
    ...validateNoCyclesInBaseType(snapshot),
    ...validateBaseTypeSameProject(snapshot),
    ...validateFieldUniquenessPerRecordType(snapshot.fields),
    ...validateBindingTargetsExist(snapshot),
  ];
}
