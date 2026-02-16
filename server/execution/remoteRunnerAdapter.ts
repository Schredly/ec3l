import type { ExecutionRequest, ExecutionResult, RunnerExecution } from "./types";
import { logBoundaryCrossing, logBoundaryReturn } from "./logging";
import { validateRequestAtBoundary, boundaryErrorToResult } from "./boundaryGuard";
import { RunnerBoundaryError } from "./boundaryErrors";
import { generateExecutionId, emitExecutionStarted, emitExecutionFailed } from "./telemetryEmitter";

export class RemoteRunnerAdapter implements RunnerExecution {
  readonly adapterName = "RemoteRunnerAdapter";

  private async executeStub(method: string, request: ExecutionRequest): Promise<ExecutionResult> {
    const execId = generateExecutionId();
    logBoundaryCrossing(this.adapterName, method, request);

    try {
      validateRequestAtBoundary(request);
    } catch (err) {
      const result = boundaryErrorToResult(err, method);
      logBoundaryReturn(this.adapterName, method, result);
      await emitExecutionFailed(execId, method, request, err instanceof RunnerBoundaryError ? err.errorType : "UNKNOWN", result.error || "Unknown error");
      return result;
    }

    await emitExecutionStarted(execId, method, request);

    const result: ExecutionResult = {
      success: false,
      output: {},
      logs: [`[runner] RemoteRunnerAdapter.${method} is not implemented`],
      error: "RemoteRunnerAdapter is not yet implemented — configure RUNNER_ADAPTER=local to use LocalRunnerAdapter",
    };

    logBoundaryReturn(this.adapterName, method, result);
    await emitExecutionFailed(execId, method, request, "NOT_IMPLEMENTED", result.error!);
    return result;
  }

  async executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult> {
    return this.executeStub("executeWorkflowStep", request);
  }

  async executeTask(request: ExecutionRequest): Promise<ExecutionResult> {
    return this.executeStub("executeTask", request);
  }

  async executeAgentAction(request: ExecutionRequest): Promise<ExecutionResult> {
    return this.executeStub("executeAgentAction", request);
  }
}
