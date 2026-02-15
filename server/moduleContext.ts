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

export class ModuleBoundaryViolationError extends Error {
  public readonly moduleId: string;
  public readonly attemptedPath: string;
  public readonly reason: string;

  constructor(opts: { moduleId: string; attemptedPath: string; reason: string }) {
    super(`Module boundary violation: ${opts.reason}`);
    this.name = "ModuleBoundaryViolationError";
    this.moduleId = opts.moduleId;
    this.attemptedPath = opts.attemptedPath;
    this.reason = opts.reason;
  }
}
