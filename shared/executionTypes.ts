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
