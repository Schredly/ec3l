import type { ModuleExecutionContext } from "../moduleContext";
import { assertModuleCapability, Capabilities } from "../capabilities";
import { storage } from "../storage";
import type { WorkflowStep, WorkflowExecution, WorkflowStepExecution } from "@shared/schema";

export class WorkflowExecutionError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "WorkflowExecutionError";
    this.statusCode = statusCode;
  }
}

type StepConfig = Record<string, unknown>;
type StepOutput = Record<string, unknown>;

interface StepHandler {
  execute(config: StepConfig, input: Record<string, unknown>, moduleCtx: ModuleExecutionContext): Promise<StepOutput>;
}

const assignmentHandler: StepHandler = {
  async execute(config, input, _moduleCtx) {
    const assigneeType = (config.assigneeType as string) || "user";
    const assignee = (config.assignee as string) || "unassigned";
    const taskTitle = (config.taskTitle as string) || "Untitled task";

    let resolvedAssignee = assignee;
    if (assigneeType === "rule") {
      resolvedAssignee = `rule-resolved:${assignee}`;
    } else if (assigneeType === "group") {
      resolvedAssignee = `group:${assignee}`;
    }

    return {
      stepType: "assignment",
      assignee: resolvedAssignee,
      assigneeType,
      taskTitle,
      assignedAt: new Date().toISOString(),
      inputRef: input,
    };
  },
};

const approvalHandler: StepHandler = {
  async execute(config, input, _moduleCtx) {
    const approver = (config.approver as string) || "pending";
    const autoApprove = config.autoApprove === true;

    const approved = autoApprove ? true : false;
    const status = autoApprove ? "auto_approved" : "pending_approval";

    return {
      stepType: "approval",
      approver,
      approved,
      status,
      createdAt: new Date().toISOString(),
      inputRef: input,
    };
  },
};

const notificationHandler: StepHandler = {
  async execute(config, input, _moduleCtx) {
    const channel = (config.channel as string) || "default";
    const recipient = (config.recipient as string) || "system";
    const template = (config.template as string) || "generic";
    const message = (config.message as string) || "";

    return {
      stepType: "notification",
      channel,
      recipient,
      template,
      message,
      emittedAt: new Date().toISOString(),
      delivered: false,
      inputRef: input,
    };
  },
};

const decisionHandler: StepHandler = {
  async execute(config, input, _moduleCtx) {
    const conditionField = config.conditionField as string;
    const conditionOperator = (config.conditionOperator as string) || "equals";
    const conditionValue = config.conditionValue;

    let result = false;
    if (conditionField && conditionField in input) {
      const fieldValue = input[conditionField];
      switch (conditionOperator) {
        case "equals":
          result = fieldValue === conditionValue;
          break;
        case "not_equals":
          result = fieldValue !== conditionValue;
          break;
        case "truthy":
          result = !!fieldValue;
          break;
        case "falsy":
          result = !fieldValue;
          break;
        default:
          result = false;
      }
    }

    const nextAction = result
      ? (config.onTrue as string) || "continue"
      : (config.onFalse as string) || "continue";

    return {
      stepType: "decision",
      conditionField,
      conditionOperator,
      conditionValue,
      result,
      nextAction,
      evaluatedAt: new Date().toISOString(),
    };
  },
};

const stepHandlers: Record<string, StepHandler> = {
  assignment: assignmentHandler,
  approval: approvalHandler,
  notification: notificationHandler,
  decision: decisionHandler,
};

export async function executeWorkflow(
  moduleCtx: ModuleExecutionContext,
  workflowDefinitionId: string,
  input: Record<string, unknown>,
): Promise<WorkflowExecution> {
  assertModuleCapability(moduleCtx, Capabilities.CMD_RUN);

  const definition = await storage.getWorkflowDefinition(workflowDefinitionId);
  if (!definition) {
    throw new WorkflowExecutionError("Workflow definition not found", 404);
  }

  if (definition.tenantId !== moduleCtx.tenantContext.tenantId) {
    throw new WorkflowExecutionError("Workflow definition does not belong to this tenant", 403);
  }

  if (definition.status !== "active") {
    throw new WorkflowExecutionError(
      `Cannot execute workflow with status "${definition.status}" — must be active`,
      400,
    );
  }

  const steps = await storage.getWorkflowStepsByDefinition(workflowDefinitionId);
  if (steps.length === 0) {
    throw new WorkflowExecutionError("Workflow has no steps defined", 400);
  }

  const execution = await storage.createWorkflowExecution({
    tenantId: moduleCtx.tenantContext.tenantId,
    workflowDefinitionId,
    input,
  });

  try {
    let currentInput = { ...input };

    for (const step of steps) {
      const stepExec = await executeStep(execution, step, currentInput, moduleCtx);

      if (stepExec.status === "failed") {
        const errorMsg = `Step "${step.stepType}" (order ${step.orderIndex}) failed`;
        await storage.updateWorkflowExecutionStatus(execution.id, "failed", errorMsg);
        const failed = await storage.getWorkflowExecution(execution.id);
        return failed!;
      }

      const output = stepExec.output as Record<string, unknown> | null;

      if (step.stepType === "approval" && output && output.status === "pending_approval") {
        await storage.updateWorkflowExecutionStatus(execution.id, "running");
        const paused = await storage.getWorkflowExecution(execution.id);
        return paused!;
      }

      if (step.stepType === "decision" && output && output.nextAction === "skip") {
        continue;
      }

      if (output) {
        currentInput = { ...currentInput, [`step_${step.orderIndex}`]: output };
      }
    }

    await storage.completeWorkflowExecution(execution.id);
    const completed = await storage.getWorkflowExecution(execution.id);
    return completed!;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown execution error";
    await storage.updateWorkflowExecutionStatus(execution.id, "failed", errorMsg);
    const failed = await storage.getWorkflowExecution(execution.id);
    return failed!;
  }
}

async function executeStep(
  execution: WorkflowExecution,
  step: WorkflowStep,
  input: Record<string, unknown>,
  moduleCtx: ModuleExecutionContext,
): Promise<WorkflowStepExecution> {
  const stepExec = await storage.createWorkflowStepExecution({
    workflowExecutionId: execution.id,
    workflowStepId: step.id,
  });

  const handler = stepHandlers[step.stepType];
  if (!handler) {
    await storage.updateWorkflowStepExecution(stepExec.id, "failed", {
      error: `Unknown step type: ${step.stepType}`,
    });
    const failed = await storage.getWorkflowStepExecution(stepExec.id);
    return failed!;
  }

  try {
    const config = (step.config as StepConfig) || {};
    const output = await handler.execute(config, input, moduleCtx);

    await storage.updateWorkflowStepExecution(stepExec.id, "completed", output);
    const completed = await storage.getWorkflowStepExecution(stepExec.id);
    return completed!;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Step execution error";
    await storage.updateWorkflowStepExecution(stepExec.id, "failed", {
      error: errorMsg,
    });
    const failed = await storage.getWorkflowStepExecution(stepExec.id);
    return failed!;
  }
}
