export type TenantContext = {
  tenantId: string;
  userId?: string;
  agentId?: string;
  source: "header" | "system";
};

export type Capability = string;

export type CapabilityProfileName =
  | "CODE_MODULE_DEFAULT"
  | "WORKFLOW_MODULE_DEFAULT"
  | "READ_ONLY"
  | "SYSTEM_PRIVILEGED";

export type ModuleExecutionContext = {
  tenantContext: TenantContext;
  moduleId: string;
  moduleRootPath: string;
  capabilityProfile: CapabilityProfileName;
  capabilities: Capability[];
};

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
