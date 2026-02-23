/**
 * Graph Contract Types
 *
 * Pure metadata types for the graph overlay. No DB assumptions.
 * These describe the shape of the tenant's configuration graph:
 * record types, fields, edges (inheritance), and bindings
 * (workflows, SLAs, assignments, change policies).
 */

// --- Nodes ---

export interface GraphNode {
  id: string;
  type: string;
  tenantId: string;
  version: number;
}

export interface RecordTypeNode extends GraphNode {
  type: "record_type";
  key: string;
  baseType: string | null;
  status: string;
  projectId: string;
}

export interface FieldDefinitionNode {
  recordTypeKey: string;
  name: string;
  fieldType: string;
  required: boolean;
}

// --- Edges ---

export type EdgeRelationship = "inherits" | "references";
export type Cardinality = "one-to-one" | "one-to-many" | "many-to-one";

export interface EdgeDefinition {
  fromType: string;
  toType: string;
  relationship: EdgeRelationship;
  cardinality: Cardinality;
  field?: string;
}

// --- Bindings ---

export interface WorkflowBinding {
  workflowId: string;
  workflowName: string;
  recordTypeKey: string;
  triggerType: string;
}

export interface SLABinding {
  recordTypeKey: string;
  durationMinutes: number;
}

export interface AssignmentBinding {
  recordTypeKey: string;
  strategyType: string;
}

export interface ChangePolicyBinding {
  recordTypeKey: string;
  policyRef: string;
}

// --- Snapshot ---

export interface GraphSnapshot {
  tenantId: string;
  builtAt: string;
  nodes: RecordTypeNode[];
  fields: FieldDefinitionNode[];
  edges: EdgeDefinition[];
  bindings: {
    workflows: WorkflowBinding[];
    slas: SLABinding[];
    assignments: AssignmentBinding[];
    changePolicies: ChangePolicyBinding[];
  };
}

// --- Validation ---

export interface GraphValidationError {
  code: string;
  message: string;
  nodeKey?: string;
  field?: string;
  recordTypeId?: string;
  baseTypeKey?: string;
  details?: Record<string, unknown>;
}
