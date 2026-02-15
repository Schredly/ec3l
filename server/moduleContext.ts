import type { TenantContext } from "./tenant";
import type { Capability } from "./capabilities";
import type { CapabilityProfileName } from "./capabilityProfiles";
import { resolveProfile } from "./capabilityProfiles";

export type ModuleExecutionContext = {
  tenantContext: TenantContext;
  moduleId: string;
  moduleRootPath: string;
  capabilityProfile: CapabilityProfileName;
  capabilities: Capability[];
};

export function buildModuleExecutionContext(opts: {
  tenantContext: TenantContext;
  moduleId: string;
  moduleRootPath: string;
  capabilityProfile: CapabilityProfileName;
}): ModuleExecutionContext {
  return {
    tenantContext: opts.tenantContext,
    moduleId: opts.moduleId,
    moduleRootPath: opts.moduleRootPath,
    capabilityProfile: opts.capabilityProfile,
    capabilities: resolveProfile(opts.capabilityProfile),
  };
}

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
