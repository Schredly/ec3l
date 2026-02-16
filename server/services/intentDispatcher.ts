import { storage } from "../storage";
import { buildModuleExecutionContext } from "../moduleContext";
import { executeWorkflow } from "./workflowEngine";
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
  if (intent.status !== "pending") {
    return intent;
  }

  const wf = await storage.getWorkflowDefinition(intent.workflowDefinitionId);
  if (!wf) {
    const failed = await storage.updateIntentFailed(intent.id, "Workflow definition not found");
    return failed ?? intent;
  }

  if (wf.status !== "active") {
    const failed = await storage.updateIntentFailed(intent.id, `Workflow definition is not active (status: ${wf.status})`);
    return failed ?? intent;
  }

  if (wf.tenantId !== intent.tenantId) {
    const failed = await storage.updateIntentFailed(intent.id, "Tenant mismatch between intent and workflow definition");
    return failed ?? intent;
  }

  const steps = await storage.getWorkflowStepsByDefinition(wf.id);
  if (steps.length === 0) {
    const failed = await storage.updateIntentFailed(intent.id, "Workflow has no steps defined");
    return failed ?? intent;
  }

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
    const tenantProjects = projects.filter((p) => p.tenantId === intent.tenantId);
    for (const proj of tenantProjects) {
      const mods = await storage.getModulesByProject(proj.id);
      if (mods.length > 0) {
        mod = mods[0];
        break;
      }
    }
  }

  if (!mod) {
    const failed = await storage.updateIntentFailed(intent.id, "No module found for workflow execution context");
    return failed ?? intent;
  }

  const tenantCtx = { tenantId: intent.tenantId, source: "system" as const };
  const moduleCtx = buildModuleExecutionContext({
    tenantContext: tenantCtx,
    moduleId: mod.id,
    moduleRootPath: mod.rootPath,
    capabilityProfile: (mod.capabilityProfile as CapabilityProfileName) ?? "WORKFLOW_MODULE_DEFAULT",
  });

  try {
    const payload = (intent.triggerPayload as Record<string, unknown>) || {};
    const execution = await executeWorkflow(moduleCtx, wf.id, payload, intent.id);
    const dispatched = await storage.updateIntentDispatched(intent.id, execution.id);
    if (!dispatched) {
      return intent;
    }
    return dispatched;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown dispatch error";
    const failed = await storage.updateIntentFailed(intent.id, errorMsg);
    return failed ?? intent;
  }
}
