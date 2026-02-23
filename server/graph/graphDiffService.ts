import type {
  GraphSnapshot,
  RecordTypeNode,
  FieldDefinitionNode,
} from "./graphContracts";

// --- Diff result types ---

export interface ModifiedRecordType {
  recordTypeKey: string;
  recordTypeId: string;
  fieldAdds: string[];
  fieldRemovals: string[];
  fieldTypeChanges: string[];
}

export interface BaseTypeChange {
  recordTypeKey: string;
  recordTypeId: string;
  before: string | null;
  after: string | null;
}

export interface BindingChanges {
  workflowsAdded: string[];
  workflowsRemoved: string[];
  slasAdded: string[];
  slasRemoved: string[];
  assignmentsAdded: string[];
  assignmentsRemoved: string[];
}

export interface GraphDiffResult {
  addedRecordTypes: RecordTypeNode[];
  removedRecordTypes: RecordTypeNode[];
  modifiedRecordTypes: ModifiedRecordType[];
  baseTypeChanges: BaseTypeChange[];
  bindingChanges: BindingChanges;
}

/**
 * Compute a deterministic diff between two graph snapshots.
 *
 * Pure function — no side effects, no DB calls. Results are sorted
 * by record type key for deterministic ordering.
 */
export function diffGraphSnapshots(
  before: GraphSnapshot,
  after: GraphSnapshot,
): GraphDiffResult {
  // --- Record type adds/removes ---
  const beforeKeys = new Map(before.nodes.map((n) => [n.key, n]));
  const afterKeys = new Map(after.nodes.map((n) => [n.key, n]));

  const addedRecordTypes: RecordTypeNode[] = [];
  const removedRecordTypes: RecordTypeNode[] = [];

  for (const [key, node] of afterKeys) {
    if (!beforeKeys.has(key)) {
      addedRecordTypes.push(node);
    }
  }

  for (const [key, node] of beforeKeys) {
    if (!afterKeys.has(key)) {
      removedRecordTypes.push(node);
    }
  }

  addedRecordTypes.sort((a, b) => a.key.localeCompare(b.key));
  removedRecordTypes.sort((a, b) => a.key.localeCompare(b.key));

  // --- BaseType changes ---
  const baseTypeChanges: BaseTypeChange[] = [];

  for (const [key, afterNode] of afterKeys) {
    const beforeNode = beforeKeys.get(key);
    if (!beforeNode) continue;
    if (beforeNode.baseType !== afterNode.baseType) {
      baseTypeChanges.push({
        recordTypeKey: key,
        recordTypeId: afterNode.id,
        before: beforeNode.baseType,
        after: afterNode.baseType,
      });
    }
  }

  baseTypeChanges.sort((a, b) => a.recordTypeKey.localeCompare(b.recordTypeKey));

  // --- Field-level changes ---
  const beforeFieldsByRt = groupFieldsByRecordType(before.fields);
  const afterFieldsByRt = groupFieldsByRecordType(after.fields);

  const allRtKeys = new Set([
    ...beforeFieldsByRt.keys(),
    ...afterFieldsByRt.keys(),
  ]);

  const modifiedRecordTypes: ModifiedRecordType[] = [];

  for (const rtKey of allRtKeys) {
    // Only diff record types that exist in both snapshots
    if (!beforeKeys.has(rtKey) || !afterKeys.has(rtKey)) continue;

    const beforeFields = beforeFieldsByRt.get(rtKey) ?? new Map();
    const afterFields = afterFieldsByRt.get(rtKey) ?? new Map();

    const fieldAdds: string[] = [];
    const fieldRemovals: string[] = [];
    const fieldTypeChanges: string[] = [];

    for (const [name] of afterFields) {
      if (!beforeFields.has(name)) {
        fieldAdds.push(name);
      }
    }

    for (const [name] of beforeFields) {
      if (!afterFields.has(name)) {
        fieldRemovals.push(name);
      }
    }

    for (const [name, afterField] of afterFields) {
      const beforeField = beforeFields.get(name);
      if (beforeField && beforeField.fieldType !== afterField.fieldType) {
        fieldTypeChanges.push(name);
      }
    }

    if (fieldAdds.length > 0 || fieldRemovals.length > 0 || fieldTypeChanges.length > 0) {
      fieldAdds.sort();
      fieldRemovals.sort();
      fieldTypeChanges.sort();

      const node = afterKeys.get(rtKey)!;
      modifiedRecordTypes.push({
        recordTypeKey: rtKey,
        recordTypeId: node.id,
        fieldAdds,
        fieldRemovals,
        fieldTypeChanges,
      });
    }
  }

  modifiedRecordTypes.sort((a, b) => a.recordTypeKey.localeCompare(b.recordTypeKey));

  // --- Binding changes ---
  const workflowsBefore = new Set(
    before.bindings.workflows.map((w) => `${w.workflowId}:${w.recordTypeKey}`),
  );
  const workflowsAfter = new Set(
    after.bindings.workflows.map((w) => `${w.workflowId}:${w.recordTypeKey}`),
  );

  const slasBefore = new Set(
    before.bindings.slas.map((s) => s.recordTypeKey),
  );
  const slasAfter = new Set(
    after.bindings.slas.map((s) => s.recordTypeKey),
  );

  const assignmentsBefore = new Set(
    before.bindings.assignments.map((a) => `${a.recordTypeKey}:${a.strategyType}`),
  );
  const assignmentsAfter = new Set(
    after.bindings.assignments.map((a) => `${a.recordTypeKey}:${a.strategyType}`),
  );

  const bindingChanges: BindingChanges = {
    workflowsAdded: [...workflowsAfter].filter((w) => !workflowsBefore.has(w)).sort(),
    workflowsRemoved: [...workflowsBefore].filter((w) => !workflowsAfter.has(w)).sort(),
    slasAdded: [...slasAfter].filter((s) => !slasBefore.has(s)).sort(),
    slasRemoved: [...slasBefore].filter((s) => !slasAfter.has(s)).sort(),
    assignmentsAdded: [...assignmentsAfter].filter((a) => !assignmentsBefore.has(a)).sort(),
    assignmentsRemoved: [...assignmentsBefore].filter((a) => !assignmentsAfter.has(a)).sort(),
  };

  return {
    addedRecordTypes,
    removedRecordTypes,
    modifiedRecordTypes,
    baseTypeChanges,
    bindingChanges,
  };
}

// --- Helpers ---

function groupFieldsByRecordType(
  fields: FieldDefinitionNode[],
): Map<string, Map<string, FieldDefinitionNode>> {
  const result = new Map<string, Map<string, FieldDefinitionNode>>();
  for (const field of fields) {
    let rtMap = result.get(field.recordTypeKey);
    if (!rtMap) {
      rtMap = new Map();
      result.set(field.recordTypeKey, rtMap);
    }
    rtMap.set(field.name, field);
  }
  return result;
}
