import type { ModuleExecutionContext, ExecutionAction, ExecutionRequest, ExecutionResult } from "@shared/executionTypes";

export type { ExecutionAction, ExecutionRequest, ExecutionResult } from "@shared/executionTypes";

export interface RunnerExecution {
  executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult>;
  executeTask(request: ExecutionRequest): Promise<ExecutionResult>;
  executeAgentAction(request: ExecutionRequest): Promise<ExecutionResult>;
}

export function buildExecutionRequest(opts: {
  moduleExecutionContext: ModuleExecutionContext;
  requestedAction: ExecutionAction;
  inputPayload: Record<string, unknown>;
}): ExecutionRequest {
  return {
    tenantContext: opts.moduleExecutionContext.tenantContext,
    moduleExecutionContext: opts.moduleExecutionContext,
    requestedAction: opts.requestedAction,
    capabilities: [...opts.moduleExecutionContext.capabilities],
    inputPayload: opts.inputPayload,
  };
}
