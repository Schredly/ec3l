import type { TenantContext } from "../tenant";
import type { SystemContext } from "../systemContext";
import type { ModuleExecutionContext } from "../moduleContext";
import { storage } from "../storage";
import { executeWorkflow as runWorkflow, resumeWorkflowExecution as engineResumeWorkflow, validateDecisionSteps, WorkflowExecutionError } from "./workflowEngine";
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
  const project = await storage.getProject(projectId);
  if (!project) {
    throw new WorkflowServiceError("Project not found", 404);
  }

  if (project.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Project does not belong to this tenant", 403);
  }

  let modulePath = "src/workflows";
  if (moduleId) {
    const mod = await storage.getModule(moduleId);
    if (mod) modulePath = mod.rootPath;
  }

  const change = await storage.createChange({
    projectId,
    title: `Workflow: ${data.name}`,
    description: `Workflow definition "${data.name}" (trigger: ${data.triggerType})`,
    moduleId: moduleId || null,
    modulePath,
  });

  const wf = await storage.createWorkflowDefinition({
    ...data,
    tenantId: ctx.tenantId,
  });

  await storage.updateWorkflowDefinitionChangeId(wf.id, change.id);
  const updated = await storage.getWorkflowDefinition(wf.id);
  return updated!;
}

export async function getWorkflowDefinitions(
  ctx: TenantContext,
): Promise<WorkflowDefinition[]> {
  return storage.getWorkflowDefinitionsByTenant(ctx.tenantId);
}

export async function getWorkflowDefinition(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowDefinition | undefined> {
  const wf = await storage.getWorkflowDefinition(id);
  if (!wf) return undefined;

  if (wf.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow definition does not belong to this tenant", 403);
  }

  return wf;
}

export async function activateWorkflowDefinition(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowDefinition> {
  const wf = await storage.getWorkflowDefinition(id);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow definition does not belong to this tenant", 403);
  }

  if (wf.status !== "draft") {
    throw new WorkflowServiceError(
      `Cannot activate workflow with status "${wf.status}" — must be draft`,
      400,
    );
  }

  if (wf.changeId) {
    const change = await storage.getChange(wf.changeId);
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

  const steps = await storage.getWorkflowStepsByDefinition(id);
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

  const updated = await storage.updateWorkflowDefinitionStatus(id, "active");
  return updated!;
}

export async function retireWorkflowDefinition(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowDefinition> {
  const wf = await storage.getWorkflowDefinition(id);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow definition does not belong to this tenant", 403);
  }

  if (wf.status === "retired") {
    return wf;
  }

  const updated = await storage.updateWorkflowDefinitionStatus(id, "retired");
  return updated!;
}

export async function addWorkflowStep(
  ctx: TenantContext,
  workflowDefinitionId: string,
  data: Omit<InsertWorkflowStep, "workflowDefinitionId">,
): Promise<WorkflowStep> {
  const wf = await storage.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow definition does not belong to this tenant", 403);
  }

  if (wf.status !== "draft") {
    throw new WorkflowServiceError(
      `Cannot modify steps of workflow with status "${wf.status}" — must be draft`,
      400,
    );
  }

  const step = await storage.createWorkflowStep({
    ...data,
    workflowDefinitionId,
  });
  return step;
}

export async function getWorkflowSteps(
  ctx: TenantContext,
  workflowDefinitionId: string,
): Promise<WorkflowStep[]> {
  const wf = await storage.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow definition does not belong to this tenant", 403);
  }

  return storage.getWorkflowStepsByDefinition(workflowDefinitionId);
}

export async function executeWorkflow(
  ctx: TenantContext,
  moduleCtx: ModuleExecutionContext,
  workflowDefinitionId: string,
  input: Record<string, unknown>,
): Promise<WorkflowExecution> {
  const wf = await storage.getWorkflowDefinition(workflowDefinitionId);
  if (!wf) {
    throw new WorkflowServiceError("Workflow definition not found", 404);
  }

  if (wf.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow definition does not belong to this tenant", 403);
  }

  try {
    return await runWorkflow(moduleCtx, workflowDefinitionId, input);
  } catch (err) {
    if (err instanceof WorkflowExecutionError) {
      throw new WorkflowServiceError(err.message, err.statusCode);
    }
    throw err;
  }
}

export async function resumeWorkflowExecution(
  ctx: TenantContext,
  moduleCtx: ModuleExecutionContext,
  workflowExecutionId: string,
  stepExecutionId: string,
  outcome: { approved: boolean; resolvedBy?: string },
): Promise<WorkflowExecution> {
  const exec = await storage.getWorkflowExecution(workflowExecutionId);
  if (!exec) {
    throw new WorkflowServiceError("Workflow execution not found", 404);
  }

  if (exec.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow execution does not belong to this tenant", 403);
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
  return storage.getWorkflowExecutionsByTenant(ctx.tenantId);
}

export async function getWorkflowExecution(
  ctx: TenantContext,
  id: string,
): Promise<WorkflowExecution | undefined> {
  const exec = await storage.getWorkflowExecution(id);
  if (!exec) return undefined;

  if (exec.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow execution does not belong to this tenant", 403);
  }

  return exec;
}

export async function getWorkflowExecutionSteps(
  ctx: TenantContext,
  executionId: string,
) {
  const exec = await storage.getWorkflowExecution(executionId);
  if (!exec) {
    throw new WorkflowServiceError("Workflow execution not found", 404);
  }

  if (exec.tenantId !== ctx.tenantId) {
    throw new WorkflowServiceError("Workflow execution does not belong to this tenant", 403);
  }

  return storage.getWorkflowStepExecutionsByExecution(executionId);
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
