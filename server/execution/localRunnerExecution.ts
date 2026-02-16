import type { ExecutionRequest, ExecutionResult, RunnerExecution } from "./types";
import { assertModuleCapability } from "../capabilities";
import { createRunnerService, enforceModuleBoundary } from "../runner";

const runnerService = createRunnerService();

function logBoundaryCrossing(method: string, request: ExecutionRequest): void {
  const tenant = request.tenantContext.tenantId;
  const module = request.moduleExecutionContext.moduleId;
  const profile = request.moduleExecutionContext.capabilityProfile;
  const action = request.requestedAction;
  const caps = request.capabilities.join(", ");
  console.log(
    `[control-plane→runner] ${method} | tenant=${tenant} module=${module} profile=${profile} action=${action} capabilities=[${caps}]`,
  );
}

function logBoundaryReturn(method: string, result: ExecutionResult): void {
  const status = result.success ? "SUCCESS" : "FAILURE";
  const errorInfo = result.error ? ` error="${result.error}"` : "";
  console.log(
    `[runner→control-plane] ${method} | status=${status}${errorInfo} logs=${result.logs.length}`,
  );
}

export class LocalRunnerExecution implements RunnerExecution {
  async executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing("executeWorkflowStep", request);

    const { moduleExecutionContext, inputPayload } = request;
    const stepType = inputPayload.stepType as string;
    const config = (inputPayload.config || {}) as Record<string, unknown>;
    const input = (inputPayload.input || {}) as Record<string, unknown>;

    try {
      for (const cap of request.capabilities) {
        assertModuleCapability(moduleExecutionContext, cap);
      }

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

      logBoundaryReturn("executeWorkflowStep", result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const result: ExecutionResult = {
        success: false,
        output: {},
        logs: [`[runner] Workflow step execution failed: ${errorMsg}`],
        error: errorMsg,
      };
      logBoundaryReturn("executeWorkflowStep", result);
      return result;
    }
  }

  async executeTask(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing("executeTask", request);

    const { moduleExecutionContext, inputPayload } = request;
    const skillName = inputPayload.skillName as string;
    const targetPath = inputPayload.target as string | undefined;

    try {
      for (const cap of request.capabilities) {
        assertModuleCapability(moduleExecutionContext, cap);
      }

      if (targetPath && moduleExecutionContext.moduleRootPath) {
        enforceModuleBoundary(moduleExecutionContext, targetPath);
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

      logBoundaryReturn("executeTask", result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const result: ExecutionResult = {
        success: false,
        output: { skillName },
        logs: [`[runner] Task execution failed: ${errorMsg}`],
        error: errorMsg,
      };
      logBoundaryReturn("executeTask", result);
      return result;
    }
  }

  async executeAgentAction(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing("executeAgentAction", request);

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
          if (instruction.targetPath && moduleExecutionContext.moduleRootPath) {
            enforceModuleBoundary(moduleExecutionContext, instruction.targetPath);
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
          logBoundaryReturn("executeAgentAction", result);
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

      logBoundaryReturn("executeAgentAction", result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const result: ExecutionResult = {
        success: false,
        output: { actionType },
        logs: [`[runner] Agent action failed: ${errorMsg}`],
        error: errorMsg,
      };
      logBoundaryReturn("executeAgentAction", result);
      return result;
    }
  }
}

let runnerExecution: RunnerExecution | null = null;

export function getRunnerExecution(): RunnerExecution {
  if (!runnerExecution) {
    runnerExecution = new LocalRunnerExecution();
  }
  return runnerExecution;
}
