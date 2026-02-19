import { storage } from "../storage";
import { buildModuleExecutionContext } from "../moduleContext";
import { executeWorkflow } from "./workflowEngine";
import { emitTelemetry, buildTelemetryParams } from "./telemetryService";
import type { WorkflowExecutionIntent } from "@shared/schema";
import type { CapabilityProfileName } from "../capabilityProfiles";

export class IntentDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntentDispatchError";
  }
}

export async function dispatchPendingIntents(): Promise<WorkflowExecutionIntent[]> {
  const pending = await storage.getPendingIntents();
  const results: WorkflowExecutionIntent[] = [];

  for (const intent of pending) {
    const result = await dispatchIntent(intent);
    results.push(result);
  }

  return results;
}

export async function dispatchIntent(
  intent: WorkflowExecutionIntent,
): Promise<WorkflowExecutionIntent> {
  // STEP 1: Reload from DB to get fresh status
  const fresh = await storage.getWorkflowExecutionIntent(intent.id);
  if (!fresh || fresh.status !== "pending") {
    return fresh ?? intent;
  }

  // STEP 2: Atomically claim the intent (pending → running)
  const claimed = await storage.claimIntent(fresh.id);
  if (!claimed) {
    // Another dispatcher already claimed it — no-op
    return fresh;
  }

  const tenantCtx = { tenantId: claimed.tenantId, source: "system" as const };
  const payload = (claimed.triggerPayload as Record<string, unknown>) || {};
  const recordId = (payload.recordId as string) ?? null;

  emitTelemetry(buildTelemetryParams(tenantCtx, {
    eventType: "workflow.intent.started",
    executionType: "task",
    executionId: claimed.id,
    workflowId: claimed.workflowDefinitionId,
    status: "running",
    affectedRecordIds: recordId ? [recordId] : null,
  }));

  // Validate workflow definition
  const wf = await storage.getWorkflowDefinition(claimed.workflowDefinitionId);
  if (!wf) {
    return failIntent(claimed, "Workflow definition not found", tenantCtx, { recordId });
  }

  if (wf.status !== "active") {
    return failIntent(claimed, `Workflow definition is not active (status: ${wf.status})`, tenantCtx, { recordId });
  }

  if (wf.tenantId !== claimed.tenantId) {
    return failIntent(claimed, "Tenant mismatch between intent and workflow definition", tenantCtx, { recordId });
  }

  const steps = await storage.getWorkflowStepsByDefinition(wf.id);
  if (steps.length === 0) {
    return failIntent(claimed, "Workflow has no steps defined", tenantCtx, { recordId });
  }

  // Resolve module context
  let moduleId: string | null = null;
  if (wf.changeId) {
    const change = await storage.getChange(wf.changeId);
    if (change?.moduleId) {
      moduleId = change.moduleId;
    }
  }

  let mod = null;
  if (moduleId) {
    mod = await storage.getModule(moduleId);
  }

  if (!mod) {
    const projects = await storage.getProjects();
    const tenantProjects = projects.filter((p) => p.tenantId === claimed.tenantId);
    for (const proj of tenantProjects) {
      const mods = await storage.getModulesByProject(proj.id);
      if (mods.length > 0) {
        mod = mods[0];
        break;
      }
    }
  }

  if (!mod) {
    return failIntent(claimed, "No module found for workflow execution context", tenantCtx, { recordId });
  }

  const moduleCtx = buildModuleExecutionContext({
    tenantContext: tenantCtx,
    moduleId: mod.id,
    moduleRootPath: mod.rootPath,
    capabilityProfile: (mod.capabilityProfile as CapabilityProfileName) ?? "WORKFLOW_MODULE_DEFAULT",
  });

  // STEP 3: Execute the workflow
  try {
    const execution = await executeWorkflow(moduleCtx, wf.id, payload, claimed.id);

    // STEP 4: Mark completed (running → completed)
    const completed = await storage.completeIntent(claimed.id, execution.id);

    emitTelemetry(buildTelemetryParams(tenantCtx, {
      eventType: "workflow.intent.completed",
      executionType: "task",
      executionId: claimed.id,
      workflowId: claimed.workflowDefinitionId,
      status: "completed",
      affectedRecordIds: recordId ? [recordId] : null,
    }));

    return completed ?? claimed;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown dispatch error";
    return failIntent(claimed, errorMsg, tenantCtx, { recordId });
  }
}

async function failIntent(
  intent: WorkflowExecutionIntent,
  error: string,
  tenantCtx: { tenantId: string; source: "system" },
  opts?: { recordId?: string | null },
): Promise<WorkflowExecutionIntent> {
  const failed = await storage.updateIntentFailed(intent.id, error);

  emitTelemetry(buildTelemetryParams(tenantCtx, {
    eventType: "workflow.intent.failed",
    executionType: "task",
    executionId: intent.id,
    workflowId: intent.workflowDefinitionId,
    status: "failed",
    affectedRecordIds: opts?.recordId ? [opts.recordId] : null,
  }));

  return failed ?? intent;
}
