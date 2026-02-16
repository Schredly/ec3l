import type { ExecutionRequest, ExecutionResult } from "./types";

export function logBoundaryCrossing(adapter: string, method: string, request: ExecutionRequest): void {
  const tenant = request.tenantContext.tenantId;
  const module = request.moduleExecutionContext.moduleId;
  const profile = request.moduleExecutionContext.capabilityProfile;
  const action = request.requestedAction;
  const caps = request.capabilities.join(", ");
  console.log(
    `[control-plane→runner] ${method} via ${adapter} | tenant=${tenant} module=${module} profile=${profile} action=${action} capabilities=[${caps}]`,
  );
}

export function logBoundaryReturn(adapter: string, method: string, result: ExecutionResult): void {
  const status = result.success ? "SUCCESS" : "FAILURE";
  const errorInfo = result.error ? ` error="${result.error}"` : "";
  console.log(
    `[runner→control-plane] ${method} via ${adapter} | status=${status}${errorInfo} logs=${result.logs.length}`,
  );
}
