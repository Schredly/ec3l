export type { ModuleExecutionContext } from "@shared/executionTypes";
import type { TenantContext } from "@shared/executionTypes";
import type { ModuleExecutionContext } from "@shared/executionTypes";
import type { CapabilityProfileName } from "@shared/executionTypes";
import { resolveProfile } from "./capabilityProfiles";

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

export { ModuleBoundaryEscapeError as ModuleBoundaryViolationError } from "../runner/boundaryErrors";
