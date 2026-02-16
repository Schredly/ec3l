import type { ModuleExecutionContext } from "../moduleContext";
import { assertModuleCapability, Capabilities } from "../capabilities";
import { storage } from "../storage";
import type { WorkflowStep, WorkflowExecution, WorkflowStepExecution } from "@shared/schema";
import { checkRecordLock } from "./formService";
import { getRunnerExecution, buildExecutionRequest } from "../execution";

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

    if (autoApprove) {
      return {
        stepType: "approval",
        approver,
        approved: true,
        status: "auto_approved",
        createdAt: new Date().toISOString(),
        inputRef: input,
      };
    }

    return {
      stepType: "approval",
      approver,
      approved: false,
      status: "awaiting_approval",
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
    const onTrueStepIndex = config.onTrueStepIndex as number;
    const onFalseStepIndex = config.onFalseStepIndex as number;

    if (onTrueStepIndex === undefined || onFalseStepIndex === undefined) {
      throw new Error("Decision step requires onTrueStepIndex and onFalseStepIndex in config");
    }

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
          throw new Error(`Unknown condition operator: ${conditionOperator}`);
      }
    }

    const targetStepIndex = result ? onTrueStepIndex : onFalseStepIndex;

    return {
      stepType: "decision",
      conditionField,
      conditionOperator,
      conditionValue,
      result,
      targetStepIndex,
      evaluatedAt: new Date().toISOString(),
    };
  },
};

const recordMutationHandler: StepHandler = {
  async execute(config, input, _moduleCtx) {
    const targetRecordType = config.targetRecordType as string;
    const mutations = config.mutations as Record<string, unknown> | undefined;
    const sourceMapping = config.sourceMapping as Record<string, string> | undefined;
    const recordIdField = (config.recordIdField as string) || "employeeId";

    if (!targetRecordType) {
      throw new Error("record_mutation step requires targetRecordType in config");
    }

    const resolvedMutations: Record<string, unknown> = {};

    if (mutations) {
      for (const [field, value] of Object.entries(mutations)) {
        resolvedMutations[field] = value;
      }
    }

    if (sourceMapping) {
      for (const [targetField, sourceField] of Object.entries(sourceMapping)) {
        if (sourceField in input) {
          resolvedMutations[targetField] = input[sourceField];
        }
      }
    }

    const recordId = input[recordIdField] as string | undefined;

    return {
      stepType: "record_mutation",
      targetRecordType,
      recordId: recordId || null,
      recordIdField,
      mutations: resolvedMutations,
      appliedAt: new Date().toISOString(),
      inputRef: input,
    };
  },
};

const recordLockHandler: StepHandler = {
  async execute(config, input, _moduleCtx) {
    const targetRecordType = config.targetRecordType as string;
    const recordIdField = (config.recordIdField as string) || "employeeId";
    const reason = (config.reason as string) || "Locked by workflow";
    const lockedBy = (config.lockedBy as string) || "workflow";

    if (!targetRecordType) {
      throw new Error("record_lock step requires targetRecordType in config");
    }

    const recordId = input[recordIdField] as string | undefined;

    if (!recordId) {
      throw new Error(`record_lock step: missing record ID from input field '${recordIdField}'`);
    }

    return {
      stepType: "record_lock",
      targetRecordType,
      recordId,
      recordIdField,
      lockedBy,
      reason,
      lockedAt: new Date().toISOString(),
      inputRef: input,
    };
  },
};

const stepHandlers: Record<string, StepHandler> = {
  assignment: assignmentHandler,
  approval: approvalHandler,
  notification: notificationHandler,
  decision: decisionHandler,
  record_mutation: recordMutationHandler,
  record_lock: recordLockHandler,
};

export function validateDecisionSteps(steps: WorkflowStep[]): string[] {
  const violations: string[] = [];
  const orderIndexSet = new Set(steps.map((s) => s.orderIndex));

  for (const step of steps) {
    if (step.stepType !== "decision") continue;
    const config = (step.config as StepConfig) || {};

    if (config.onTrueStepIndex === undefined || config.onTrueStepIndex === null) {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: missing onTrueStepIndex`);
    } else if (typeof config.onTrueStepIndex !== "number") {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: onTrueStepIndex must be a number`);
    } else if (!orderIndexSet.has(config.onTrueStepIndex as number)) {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: onTrueStepIndex ${config.onTrueStepIndex} does not reference an existing step`);
    }

    if (config.onFalseStepIndex === undefined || config.onFalseStepIndex === null) {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: missing onFalseStepIndex`);
    } else if (typeof config.onFalseStepIndex !== "number") {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: onFalseStepIndex must be a number`);
    } else if (!orderIndexSet.has(config.onFalseStepIndex as number)) {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: onFalseStepIndex ${config.onFalseStepIndex} does not reference an existing step`);
    }

    if (typeof config.conditionField !== "string" || !config.conditionField) {
      violations.push(`Decision step at orderIndex ${step.orderIndex}: missing conditionField`);
    }
  }

  return violations;
}

export async function executeWorkflow(
  moduleCtx: ModuleExecutionContext,
  workflowDefinitionId: string,
  input: Record<string, unknown>,
  intentId: string,
): Promise<WorkflowExecution> {
  if (!intentId) {
    throw new WorkflowExecutionError(
      "Workflow execution requires a valid intentId — direct execution is not allowed",
      403,
    );
  }

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
    intentId,
    input,
  });

  return runStepsFromIndex(execution, steps, { ...input }, 0, moduleCtx);
}

export async function resumeWorkflowExecution(
  moduleCtx: ModuleExecutionContext,
  workflowExecutionId: string,
  stepExecutionId: string,
  outcome: { approved: boolean; resolvedBy?: string },
): Promise<WorkflowExecution> {
  assertModuleCapability(moduleCtx, Capabilities.CMD_RUN);

  const execution = await storage.getWorkflowExecution(workflowExecutionId);
  if (!execution) {
    throw new WorkflowExecutionError("Workflow execution not found", 404);
  }

  if (execution.tenantId !== moduleCtx.tenantContext.tenantId) {
    throw new WorkflowExecutionError("Workflow execution does not belong to this tenant", 403);
  }

  if (execution.status !== "paused") {
    throw new WorkflowExecutionError(
      `Cannot resume workflow execution with status "${execution.status}" — must be paused`,
      400,
    );
  }

  if (!execution.pausedAtStepId) {
    throw new WorkflowExecutionError("Workflow execution has no paused step recorded", 400);
  }

  const stepExec = await storage.getWorkflowStepExecution(stepExecutionId);
  if (!stepExec) {
    throw new WorkflowExecutionError("Step execution not found", 404);
  }

  if (stepExec.workflowExecutionId !== workflowExecutionId) {
    throw new WorkflowExecutionError("Step execution does not belong to this workflow execution", 400);
  }

  if (stepExec.status !== "awaiting_approval") {
    throw new WorkflowExecutionError(
      `Cannot resolve step execution with status "${stepExec.status}" — must be awaiting_approval`,
      400,
    );
  }

  if (stepExec.workflowStepId !== execution.pausedAtStepId) {
    throw new WorkflowExecutionError("Step execution does not match the paused step", 400);
  }

  const approvalOutput: StepOutput = {
    stepType: "approval",
    approved: outcome.approved,
    status: outcome.approved ? "approved" : "rejected",
    resolvedBy: outcome.resolvedBy || "unknown",
    resolvedAt: new Date().toISOString(),
  };

  await storage.updateWorkflowStepExecution(stepExec.id, "completed", approvalOutput);

  if (!outcome.approved) {
    const errorMsg = `Approval rejected by ${outcome.resolvedBy || "unknown"}`;
    await storage.updateWorkflowExecutionStatus(workflowExecutionId, "failed", errorMsg);
    const failed = await storage.getWorkflowExecution(workflowExecutionId);
    return failed!;
  }

  const steps = await storage.getWorkflowStepsByDefinition(execution.workflowDefinitionId);
  const pausedStep = steps.find((s) => s.id === execution.pausedAtStepId);
  if (!pausedStep) {
    throw new WorkflowExecutionError("Paused step definition not found", 400);
  }

  const pausedStepArrayIndex = steps.findIndex((s) => s.id === execution.pausedAtStepId);
  const nextArrayIndex = pausedStepArrayIndex + 1;

  let currentInput = (execution.accumulatedInput as Record<string, unknown>) || {};
  currentInput = { ...currentInput, [`step_${pausedStep.orderIndex}`]: approvalOutput };

  await storage.updateWorkflowExecutionStatus(workflowExecutionId, "running");

  if (nextArrayIndex >= steps.length) {
    await storage.completeWorkflowExecution(workflowExecutionId);
    const completed = await storage.getWorkflowExecution(workflowExecutionId);
    return completed!;
  }

  return runStepsFromIndex(
    { ...execution, status: "running" },
    steps,
    currentInput,
    nextArrayIndex,
    moduleCtx,
  );
}

async function runStepsFromIndex(
  execution: WorkflowExecution,
  steps: WorkflowStep[],
  currentInput: Record<string, unknown>,
  startArrayIndex: number,
  moduleCtx: ModuleExecutionContext,
): Promise<WorkflowExecution> {
  const stepsByOrderIndex = new Map<number, number>();
  for (let i = 0; i < steps.length; i++) {
    stepsByOrderIndex.set(steps[i].orderIndex, i);
  }

  try {
    let arrayIndex = startArrayIndex;

    while (arrayIndex < steps.length) {
      const step = steps[arrayIndex];
      const stepExec = await executeStep(execution, step, currentInput, moduleCtx);

      if (stepExec.status === "failed") {
        const errorMsg = `Step "${step.stepType}" (order ${step.orderIndex}) failed`;
        await storage.updateWorkflowExecutionStatus(execution.id, "failed", errorMsg);
        const failed = await storage.getWorkflowExecution(execution.id);
        return failed!;
      }

      const output = stepExec.output as StepOutput | null;

      if (step.stepType === "approval" && stepExec.status === "awaiting_approval") {
        await storage.pauseWorkflowExecution(execution.id, step.id, currentInput);
        const paused = await storage.getWorkflowExecution(execution.id);
        return paused!;
      }

      if (output) {
        currentInput = { ...currentInput, [`step_${step.orderIndex}`]: output };
      }

      if (step.stepType === "record_lock" && output && output.recordId) {
        const config = (step.config as StepConfig) || {};
        const targetRecordType = config.targetRecordType as string;
        const rt = await storage.getRecordTypeByTenantAndName(
          moduleCtx.tenantContext.tenantId,
          targetRecordType,
        );
        if (rt) {
          const existingLock = await storage.getRecordLock(
            moduleCtx.tenantContext.tenantId,
            rt.id,
            output.recordId as string,
          );
          if (!existingLock) {
            await storage.createRecordLock({
              tenantId: moduleCtx.tenantContext.tenantId,
              recordTypeId: rt.id,
              recordId: output.recordId as string,
              lockedBy: (output.lockedBy as string) || "workflow",
              workflowExecutionId: execution.id,
              reason: (output.reason as string) || "Locked by workflow",
            });
          }
        }
      }

      if (step.stepType === "record_mutation" && output && output.recordId) {
        const config = (step.config as StepConfig) || {};
        const targetRecordType = config.targetRecordType as string;
        const rt = await storage.getRecordTypeByTenantAndName(
          moduleCtx.tenantContext.tenantId,
          targetRecordType,
        );
        if (rt) {
          await checkRecordLock(moduleCtx.tenantContext, rt.id, output.recordId as string);
        }
      }

      if (step.stepType === "decision" && output && typeof output.targetStepIndex === "number") {
        const targetArrayIndex = stepsByOrderIndex.get(output.targetStepIndex as number);
        if (targetArrayIndex === undefined) {
          const errorMsg = `Decision step branched to invalid orderIndex ${output.targetStepIndex}`;
          await storage.updateWorkflowExecutionStatus(execution.id, "failed", errorMsg);
          const failed = await storage.getWorkflowExecution(execution.id);
          return failed!;
        }
        arrayIndex = targetArrayIndex;
      } else {
        arrayIndex++;
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

  const runner = getRunnerExecution();
  const config = (step.config as StepConfig) || {};
  const executionRequest = buildExecutionRequest({
    moduleExecutionContext: moduleCtx,
    requestedAction: "workflow_step",
    inputPayload: {
      stepType: step.stepType,
      config,
      input,
      executionId: execution.id,
      stepId: step.id,
    },
  });

  const boundaryResult = await runner.executeWorkflowStep(executionRequest);

  try {
    const output = await handler.execute(config, input, moduleCtx);
    const outputWithLogs = { ...output, runnerLogs: boundaryResult.logs };

    if (step.stepType === "approval" && output.status === "awaiting_approval") {
      await storage.updateWorkflowStepExecution(stepExec.id, "awaiting_approval", outputWithLogs);
      const awaiting = await storage.getWorkflowStepExecution(stepExec.id);
      return awaiting!;
    }

    await storage.updateWorkflowStepExecution(stepExec.id, "completed", outputWithLogs);
    const completed = await storage.getWorkflowStepExecution(stepExec.id);
    return completed!;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Step execution error";
    await storage.updateWorkflowStepExecution(stepExec.id, "failed", {
      error: errorMsg,
      runnerLogs: boundaryResult?.logs || [],
    });
    const failed = await storage.getWorkflowStepExecution(stepExec.id);
    return failed!;
  }
}
