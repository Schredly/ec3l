import type { ExecutionRequest, ExecutionResult, RunnerExecution } from "./types";
import { logBoundaryCrossing, logBoundaryReturn } from "./logging";
import { validateRequestAtBoundary, boundaryErrorToResult } from "./boundaryGuard";

export class RemoteRunnerAdapter implements RunnerExecution {
  readonly adapterName = "RemoteRunnerAdapter";

  async executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeWorkflowStep", request);

    try {
      validateRequestAtBoundary(request);
    } catch (err) {
      const result = boundaryErrorToResult(err, "executeWorkflowStep");
      logBoundaryReturn(this.adapterName, "executeWorkflowStep", result);
      return result;
    }

    const result: ExecutionResult = {
      success: false,
      output: {},
      logs: [`[runner] RemoteRunnerAdapter.executeWorkflowStep is not implemented`],
      error: "RemoteRunnerAdapter is not yet implemented — configure RUNNER_ADAPTER=local to use LocalRunnerAdapter",
    };

    logBoundaryReturn(this.adapterName, "executeWorkflowStep", result);
    return result;
  }

  async executeTask(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeTask", request);

    try {
      validateRequestAtBoundary(request);
    } catch (err) {
      const result = boundaryErrorToResult(err, "executeTask");
      logBoundaryReturn(this.adapterName, "executeTask", result);
      return result;
    }

    const result: ExecutionResult = {
      success: false,
      output: {},
      logs: [`[runner] RemoteRunnerAdapter.executeTask is not implemented`],
      error: "RemoteRunnerAdapter is not yet implemented — configure RUNNER_ADAPTER=local to use LocalRunnerAdapter",
    };

    logBoundaryReturn(this.adapterName, "executeTask", result);
    return result;
  }

  async executeAgentAction(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeAgentAction", request);

    try {
      validateRequestAtBoundary(request);
    } catch (err) {
      const result = boundaryErrorToResult(err, "executeAgentAction");
      logBoundaryReturn(this.adapterName, "executeAgentAction", result);
      return result;
    }

    const result: ExecutionResult = {
      success: false,
      output: {},
      logs: [`[runner] RemoteRunnerAdapter.executeAgentAction is not implemented`],
      error: "RemoteRunnerAdapter is not yet implemented — configure RUNNER_ADAPTER=local to use LocalRunnerAdapter",
    };

    logBoundaryReturn(this.adapterName, "executeAgentAction", result);
    return result;
  }
}
