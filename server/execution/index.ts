export type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionAction,
  RunnerExecution,
} from "./types";

export { buildExecutionRequest } from "./types";
export { LocalRunnerAdapter } from "./localRunnerAdapter";
export { RemoteRunnerAdapter } from "./remoteRunnerAdapter";
export { getRunnerExecution, getActiveAdapterType } from "./runnerAdapterFactory";
export type { RunnerAdapterType } from "./runnerAdapterFactory";
export { validateRequestAtBoundary, validateModuleBoundaryPath, boundaryErrorToResult } from "./boundaryGuard";
export {
  RunnerBoundaryError,
  MissingTenantContextError,
  MissingModuleContextError,
  CapabilityNotGrantedError,
  ModuleBoundaryEscapeError,
  TenantContextMutationError,
} from "./boundaryErrors";

export { configureRunnerTelemetry } from "./telemetryEmitter";
export type { RunnerTelemetrySink, TelemetryEventData } from "./telemetryEmitter";
