import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type {
  GraphSnapshot,
  RecordTypeNode,
  FieldDefinitionNode,
  EdgeDefinition,
  WorkflowBinding,
  SLABinding,
  AssignmentBinding,
} from "./graphContracts";

/**
 * Build a tenant-scoped GraphSnapshot from existing tables.
 *
 * Reads: record_types (schema, baseType, assignmentConfig, slaConfig),
 *        workflow_definitions + triggers.
 * No new tables required — everything is inferred from existing data.
 */
export async function buildGraphSnapshot(
  ctx: TenantContext,
): Promise<GraphSnapshot> {
  const ts = getTenantStorage(ctx);

  const recordTypes = await ts.listRecordTypes();
  const workflowDefs = await ts.getWorkflowDefinitionsByTenant();
  const triggers = await ts.getWorkflowTriggersByTenant();

  const nodes: RecordTypeNode[] = [];
  const fields: FieldDefinitionNode[] = [];
  const edges: EdgeDefinition[] = [];
  const workflows: WorkflowBinding[] = [];
  const slas: SLABinding[] = [];
  const assignments: AssignmentBinding[] = [];

  // Build a key→id lookup for record types
  const rtKeySet = new Set(recordTypes.map((rt) => rt.key));

  for (const rt of recordTypes) {
    nodes.push({
      id: rt.id,
      type: "record_type",
      tenantId: ctx.tenantId,
      version: rt.version,
      key: rt.key,
      baseType: rt.baseType,
      status: rt.status,
      projectId: rt.projectId,
    });

    // Extract fields from schema
    const schema = rt.schema as { fields?: Array<{ name: string; type: string; required?: boolean }> } | null;
    if (schema?.fields && Array.isArray(schema.fields)) {
      for (const f of schema.fields) {
        fields.push({
          recordTypeKey: rt.key,
          name: f.name,
          fieldType: f.type,
          required: f.required === true,
        });

        // Reference fields create edges
        if (f.type === "reference") {
          const refTarget = (f as Record<string, unknown>).referenceType as string | undefined;
          if (refTarget && rtKeySet.has(refTarget)) {
            edges.push({
              fromType: rt.key,
              toType: refTarget,
              relationship: "references",
              cardinality: "many-to-one",
              field: f.name,
            });
          }
        }
      }
    }

    // BaseType inheritance edge
    if (rt.baseType) {
      edges.push({
        fromType: rt.key,
        toType: rt.baseType,
        relationship: "inherits",
        cardinality: "one-to-one",
      });
    }

    // SLA binding
    const slaConfig = rt.slaConfig as { durationMinutes?: number } | null;
    if (slaConfig?.durationMinutes && slaConfig.durationMinutes > 0) {
      slas.push({
        recordTypeKey: rt.key,
        durationMinutes: slaConfig.durationMinutes,
      });
    }

    // Assignment binding
    const assignConfig = rt.assignmentConfig as { type?: string } | null;
    if (assignConfig?.type) {
      assignments.push({
        recordTypeKey: rt.key,
        strategyType: assignConfig.type,
      });
    }
  }

  // Workflow bindings from triggers
  const wfById = new Map(workflowDefs.map((wf) => [wf.id, wf]));

  for (const trigger of triggers) {
    if (trigger.triggerType !== "record_event") continue;

    const config = trigger.triggerConfig as { recordType?: string } | null;
    if (!config?.recordType) continue;

    const wf = wfById.get(trigger.workflowDefinitionId);
    if (!wf) continue;

    workflows.push({
      workflowId: wf.id,
      workflowName: wf.name,
      recordTypeKey: config.recordType,
      triggerType: trigger.triggerType,
    });
  }

  return {
    tenantId: ctx.tenantId,
    builtAt: new Date().toISOString(),
    nodes,
    fields,
    edges,
    bindings: {
      workflows,
      slas,
      assignments,
      changePolicies: [],
    },
  };
}
