import type { TenantContext } from "../tenant";
import type { SystemContext } from "../systemContext";
import type { ModuleExecutionContext } from "../moduleContext";
import { storage } from "../storage";
import { getTenantStorage } from "../tenantStorage";
import { resumeWorkflowExecution as engineResumeWorkflow, validateDecisionSteps, WorkflowExecutionError } from "./workflowEngine";
import { dispatchIntent } from "./intentDispatcher";
import type {
  WorkflowDefinition,
  InsertWorkflowDefinition,
  WorkflowStep,
  InsertWorkflowStep,
  WorkflowExecution,
} from "@shared/schema";

export class WorkflowServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "WorkflowServiceError";
    this.statusCode = statusCode;
  }
}

export async function createWorkflowDefinition(
  ctx: TenantContext,
  data: Omit<InsertWorkflowDefinition, "tenantId">,
  projectId: string,
  moduleId?: string,
): Promise<WorkflowDefinition> {
  const ts = getTenantStorage(ctx);
  const project = await ts.getProject(projectId);
  if (!project) {
    throw new WorkflowServiceError("Project not found", 404);
  }

  let modulePath = "src/workflows";
  if (moduleId) {
    const mod = await ts.getModule(moduleId);
    if (mod) modulePath = mod.rootPath;
  }

  const change = await ts.createChange({
    projectId,
    title: `Workflow: ${data.name}`,
    description: `Workflow definition "${data.name}" (trigger: ${data.triggerType})`,
    moduleId: moduleId || null,
    modulePath,
  });

  const wf = await ts.createWorkflowDefinition({
    ...data,
    tenantId: ctx.tenantId,
  });

  await ts.updateWorkflowDefinitionChangeId(wf.id, change.id);
  const updated = await ts.getWorkflowDefinition(wf.id);
  return updated!;
}

export async function getWorkflowDefinitions(
  ctx: TenantContext,
): Promise<WorkflowDefinition[]> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkflowDefinitionsByTenant();
}

export async function getWorkflowDefinition(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowDefinition | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkflowDefinition(id);
}

export async function activateWorkflowDefinition(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowDefinition> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(id);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.status !== "draft") {
    throw new WorkflowServiceError(
      `Cannot activate workflow with status "${wf.status}" — must be draft`,
      400,
    );
  }

  if (wf.changeId) {
    const change = await ts.getChange(wf.changeId);
    if (!change) {
      throw new WorkflowServiceError("Linked change record not found", 400);
    }
    if (change.status !== "Ready" && change.status !== "Merged") {
      throw new WorkflowServiceError(
        `Cannot activate workflow — linked change must be Ready or Merged, current status: "${change.status}"`,
        400,
      );
    }
  }

  const steps = await ts.getWorkflowStepsByDefinition(id);
  if (steps.length === 0) {
    throw new WorkflowServiceError("Cannot activate workflow with no steps", 400);
  }

  const decisionViolations = validateDecisionSteps(steps);
  if (decisionViolations.length > 0) {
    throw new WorkflowServiceError(
      `Cannot activate workflow — invalid decision step config: ${decisionViolations.join("; ")}`,
      400,
    );
  }

  const updated = await ts.updateWorkflowDefinitionStatus(id, "active");
  return updated!;
}

export async function retireWorkflowDefinition(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowDefinition> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(id);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.status === "retired") {
    return wf;
  }

  const updated = await ts.updateWorkflowDefinitionStatus(id, "retired");
  return updated!;
}

export async function addWorkflowStep(
  ctx: TenantContext,
  workflowDefinitionId: string,
  data: Omit<InsertWorkflowStep, "workflowDefinitionId">,
): Promise<WorkflowStep> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.status !== "draft") {
    throw new WorkflowServiceError(
      `Cannot modify steps of workflow with status "${wf.status}" — must be draft`,
      400,
    );
  }

  const step = await ts.createWorkflowStep({
    ...data,
    workflowDefinitionId,
  });
  return step;
}

export async function getWorkflowSteps(
  ctx: TenantContext,
  workflowDefinitionId: string,
): Promise<WorkflowStep[]> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  return ts.getWorkflowStepsByDefinition(workflowDefinitionId);
}

export async function executeWorkflow(
  ctx: TenantContext,
  _moduleCtx: ModuleExecutionContext,
  workflowDefinitionId: string,
  input: Record<string, unknown>,
): Promise<WorkflowExecution> {
  const ts = getTenantStorage(ctx);
  const wf = await ts.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.status !== "active") {
    throw new WorkflowServiceError(
      `Cannot execute workflow with status "${wf.status}" — must be active`,
      400,
    );
  }

  const idempotencyKey = `api:${ctx.tenantId}:${workflowDefinitionId}:${new Date().toISOString()}`;
  const intent = await ts.createWorkflowExecutionIntent({
    tenantId: ctx.tenantId,
    workflowDefinitionId,
    triggerType: "manual",
    triggerPayload: { ...input, source: "direct_api", createdAt: new Date().toISOString() },
    idempotencyKey,
  });

  const dispatched = await dispatchIntent(intent);

  if (dispatched.status === "failed") {
    throw new WorkflowServiceError(dispatched.error || "Intent dispatch failed", 500);
  }

  if (!dispatched.executionId) {
    throw new WorkflowServiceError("Intent dispatched but no execution created", 500);
  }

  const execution = await ts.getWorkflowExecution(dispatched.executionId);
  if (!execution) {
    throw new WorkflowServiceError("Execution not found after dispatch", 500);
  }

  return execution;
}

export async function resumeWorkflowExecution(
  ctx: TenantContext,
  moduleCtx: ModuleExecutionContext,
  workflowExecutionId: string,
  stepExecutionId: string,
  outcome: { approved: boolean; resolvedBy?: string },
): Promise<WorkflowExecution> {
  const ts = getTenantStorage(ctx);
  const exec = await ts.getWorkflowExecution(workflowExecutionId);
  if (!exec) {
    throw new WorkflowServiceError("Workflow execution not found", 404);
  }

  try {
    return await engineResumeWorkflow(moduleCtx, workflowExecutionId, stepExecutionId, outcome);
  } catch (err) {
    if (err instanceof WorkflowExecutionError) {
      throw new WorkflowServiceError(err.message, err.statusCode);
    }
    throw err;
  }
}

export async function getWorkflowExecutions(
  ctx: TenantContext,
): Promise<WorkflowExecution[]> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkflowExecutionsByTenant();
}

export async function getWorkflowExecution(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowExecution | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkflowExecution(id);
}

export async function getWorkflowExecutionSteps(
  ctx: TenantContext,
  executionId: string,
) {
  const ts = getTenantStorage(ctx);
  const exec = await ts.getWorkflowExecution(executionId);
  if (!exec) {
    throw new WorkflowServiceError("Workflow execution not found", 404);
  }

  return ts.getWorkflowStepExecutionsByExecution(executionId);
}

export async function systemInspectWorkflows(
  _ctx: SystemContext,
  tenantId: string,
): Promise<WorkflowDefinition[]> {
  return storage.getWorkflowDefinitionsByTenant(tenantId);
}

export async function systemInspectExecution(
  _ctx: SystemContext,
  executionId: string,
): Promise<WorkflowExecution | undefined> {
  return storage.getWorkflowExecution(executionId);
}
