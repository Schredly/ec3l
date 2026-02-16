import type { ExecutionRequest, ExecutionResult, RunnerExecution } from "./types";
import { createRunnerService } from "../runner";
import type { RunnerInstruction } from "../runner";
import { logBoundaryCrossing, logBoundaryReturn } from "./logging";
import { validateRequestAtBoundary, validateModuleBoundaryPath, boundaryErrorToResult } from "./boundaryGuard";

const runnerService = createRunnerService();

export class LocalRunnerAdapter implements RunnerExecution {
  readonly adapterName = "LocalRunnerAdapter";

  async executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeWorkflowStep", request);

    try {
      validateRequestAtBoundary(request);
    } catch (err) {
      const result = boundaryErrorToResult(err, "executeWorkflowStep");
      logBoundaryReturn(this.adapterName, "executeWorkflowStep", result);
      return result;
    }

    const { moduleExecutionContext, inputPayload } = request;
    const stepType = inputPayload.stepType as string;
    const config = (inputPayload.config || {}) as Record<string, unknown>;
    const input = (inputPayload.input || {}) as Record<string, unknown>;

    try {
      const result: ExecutionResult = {
        success: true,
        output: {
          stepType,
          config,
          input,
          executedAt: new Date().toISOString(),
        },
        logs: [
          `[runner] Executing workflow step: ${stepType}`,
          `[runner] Module: ${moduleExecutionContext.moduleId}`,
          `[runner] Tenant: ${request.tenantContext.tenantId}`,
        ],
      };

      logBoundaryReturn(this.adapterName, "executeWorkflowStep", result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const result: ExecutionResult = {
        success: false,
        output: {},
        logs: [`[runner] Workflow step execution failed: ${errorMsg}`],
        error: errorMsg,
      };
      logBoundaryReturn(this.adapterName, "executeWorkflowStep", result);
      return result;
    }
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

    const { moduleExecutionContext, inputPayload } = request;
    const skillName = inputPayload.skillName as string;
    const targetPath = inputPayload.target as string | undefined;

    try {
      if (targetPath) {
        validateModuleBoundaryPath(
          moduleExecutionContext.moduleId,
          moduleExecutionContext.moduleRootPath,
          targetPath,
        );
      }

      const result: ExecutionResult = {
        success: true,
        output: {
          skillName,
          target: targetPath,
          boundaryChecked: true,
        },
        logs: [
          `[runner] Task boundary check passed: ${skillName}`,
          `[runner] Module: ${moduleExecutionContext.moduleId}`,
          `[runner] Tenant: ${request.tenantContext.tenantId}`,
        ],
      };

      logBoundaryReturn(this.adapterName, "executeTask", result);
      return result;
    } catch (err) {
      const result = boundaryErrorToResult(err, "executeTask");
      logBoundaryReturn(this.adapterName, "executeTask", result);
      return result;
    }
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

    const { moduleExecutionContext, inputPayload } = request;
    const actionType = inputPayload.actionType as string;

    try {
      let runnerResult;

      switch (actionType) {
        case "start_workspace": {
          const workspaceId = inputPayload.workspaceId as string;
          runnerResult = await runnerService.startWorkspace(workspaceId, moduleExecutionContext);
          break;
        }
        case "run_command": {
          const instruction: RunnerInstruction = {
            workspaceId: inputPayload.workspaceId as string || "",
            command: inputPayload.command as string || "",
            targetPath: inputPayload.targetPath as string | undefined,
          };
          if (instruction.targetPath) {
            validateModuleBoundaryPath(
              moduleExecutionContext.moduleId,
              moduleExecutionContext.moduleRootPath,
              instruction.targetPath,
            );
          }
          runnerResult = await runnerService.runCommand(instruction, moduleExecutionContext);
          break;
        }
        case "get_diff": {
          const workspaceId = inputPayload.workspaceId as string;
          runnerResult = await runnerService.getDiff(workspaceId, moduleExecutionContext);
          break;
        }
        case "get_logs": {
          const workspaceId = inputPayload.workspaceId as string;
          runnerResult = await runnerService.getLogs(workspaceId, moduleExecutionContext);
          break;
        }
        default: {
          const result: ExecutionResult = {
            success: false,
            output: {},
            logs: [`[runner] Unknown agent action type: ${actionType}`],
            error: `Unknown agent action type: ${actionType}`,
          };
          logBoundaryReturn(this.adapterName, "executeAgentAction", result);
          return result;
        }
      }

      const result: ExecutionResult = {
        success: runnerResult.success,
        output: {
          actionType,
          containerId: runnerResult.containerId,
          previewUrl: runnerResult.previewUrl,
        },
        logs: runnerResult.logs,
        error: runnerResult.failureReason,
      };

      logBoundaryReturn(this.adapterName, "executeAgentAction", result);
      return result;
    } catch (err) {
      const result = boundaryErrorToResult(err, "executeAgentAction");
      logBoundaryReturn(this.adapterName, "executeAgentAction", result);
      return result;
    }
  }
}
