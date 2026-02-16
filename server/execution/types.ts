import type { TenantContext } from "../tenant";
import type { ModuleExecutionContext } from "../moduleContext";
import type { Capability } from "../capabilities";

export type ExecutionAction =
  | "workflow_step"
  | "agent_task"
  | "agent_action"
  | "workspace_start"
  | "workspace_stop"
  | "skill_invoke";

export type ExecutionRequest = {
  tenantContext: TenantContext;
  moduleExecutionContext: ModuleExecutionContext;
  requestedAction: ExecutionAction;
  capabilities: Capability[];
  inputPayload: Record<string, unknown>;
};

export type ExecutionResult = {
  success: boolean;
  output: Record<string, unknown>;
  logs: string[];
  error?: string;
};

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
