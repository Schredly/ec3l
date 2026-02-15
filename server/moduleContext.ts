import type { TenantContext } from "./tenant";

export type ModuleExecutionContext = {
  tenantContext: TenantContext;
  moduleId: string;
  moduleRootPath: string;
  capabilities?: string[];
};

export class ModuleContextError extends Error {
  constructor(message = "Missing module execution context") {
    super(message);
    this.name = "ModuleContextError";
  }
}
