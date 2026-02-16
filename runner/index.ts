export type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionAction,
  RunnerExecution,
} from "./types";

export { buildExecutionRequest } from "./types";

export { LocalRunnerAdapter } from "./adapters/localRunnerAdapter";
export { RemoteRunnerAdapter } from "./adapters/remoteRunnerAdapter";

export { getRunnerExecution, getActiveAdapterType } from "./adapterFactory";
export type { RunnerAdapterType } from "./adapterFactory";

export { validateRequestAtBoundary, validateModuleBoundaryPath, boundaryErrorToResult } from "./boundaryGuard";
export {
  RunnerBoundaryError,
  MissingTenantContextError,
  MissingModuleContextError,
  CapabilityNotGrantedError,
  ModuleBoundaryEscapeError,
  TenantContextMutationError,
} from "./boundaryErrors";

export { configureRunnerTelemetry, generateExecutionId, emitExecutionStarted, emitExecutionCompleted, emitExecutionFailed } from "./telemetry";
export type { RunnerTelemetrySink, TelemetryEventData } from "./telemetry";

export { createRunnerService, enforceModuleBoundary } from "./service";
export type { IRunnerService, RunnerInstruction, RunnerResult } from "./service";
export { ModuleBoundaryViolationError } from "./service";

export { initRunner } from "./init";
export type { RunnerConfig, RunnerInstance } from "./init";
