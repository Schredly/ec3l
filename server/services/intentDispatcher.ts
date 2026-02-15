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
  const wf = await storage.getWorkflowDefinition(intent.workflowDefinitionId);
  if (!wf) {
    return (await storage.updateIntentFailed(intent.id, "Workflow definition not found"))!;
  }

  if (wf.status !== "active") {
    return (await storage.updateIntentFailed(intent.id, `Workflow definition is not active (status: ${wf.status})`))!;
  }

  if (wf.tenantId !== intent.tenantId) {
    return (await storage.updateIntentFailed(intent.id, "Tenant mismatch between intent and workflow definition"))!;
  }

  const steps = await storage.getWorkflowStepsByDefinition(wf.id);
  if (steps.length === 0) {
    return (await storage.updateIntentFailed(intent.id, "Workflow has no steps defined"))!;
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
    return (await storage.updateIntentFailed(intent.id, "No module found for workflow execution context"))!;
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
    const execution = await executeWorkflow(moduleCtx, wf.id, payload);
    return (await storage.updateIntentDispatched(intent.id, execution.id))!;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown dispatch error";
    return (await storage.updateIntentFailed(intent.id, errorMsg))!;
  }
}
