export class RunnerBoundaryError extends Error {
  public readonly errorType: string;

  constructor(errorType: string, message: string) {
    super(message);
    this.name = "RunnerBoundaryError";
    this.errorType = errorType;
  }
}

export class MissingTenantContextError extends RunnerBoundaryError {
  constructor(detail?: string) {
    super(
      "MISSING_TENANT_CONTEXT",
      `Runner boundary rejected: tenant context is missing or invalid${detail ? ` — ${detail}` : ""}`,
    );
    this.name = "MissingTenantContextError";
  }
}

export class MissingModuleContextError extends RunnerBoundaryError {
  constructor(detail?: string) {
    super(
      "MISSING_MODULE_CONTEXT",
      `Runner boundary rejected: module execution context is missing or invalid${detail ? ` — ${detail}` : ""}`,
    );
    this.name = "MissingModuleContextError";
  }
}

export class CapabilityNotGrantedError extends RunnerBoundaryError {
  public readonly capability: string;
  public readonly grantedCapabilities: readonly string[];

  constructor(capability: string, grantedCapabilities: readonly string[]) {
    super(
      "CAPABILITY_NOT_GRANTED",
      `Runner boundary rejected: capability "${capability}" is not granted. Granted: [${grantedCapabilities.join(", ")}]`,
    );
    this.name = "CapabilityNotGrantedError";
    this.capability = capability;
    this.grantedCapabilities = grantedCapabilities;
  }
}

export class ModuleBoundaryEscapeError extends RunnerBoundaryError {
  public readonly moduleId: string;
  public readonly moduleRootPath: string;
  public readonly attemptedPath: string;

  constructor(opts: { moduleId: string; moduleRootPath: string; attemptedPath: string; reason: string }) {
    super(
      "MODULE_BOUNDARY_ESCAPE",
      `Runner boundary rejected: path "${opts.attemptedPath}" violates module boundary for module "${opts.moduleId}" (root: "${opts.moduleRootPath}") — ${opts.reason}`,
    );
    this.name = "ModuleBoundaryEscapeError";
    this.moduleId = opts.moduleId;
    this.moduleRootPath = opts.moduleRootPath;
    this.attemptedPath = opts.attemptedPath;
  }
}

export class TenantContextMutationError extends RunnerBoundaryError {
  constructor(detail: string) {
    super(
      "TENANT_CONTEXT_MUTATION",
      `Runner boundary rejected: tenant context integrity violation — ${detail}`,
    );
    this.name = "TenantContextMutationError";
  }
}
