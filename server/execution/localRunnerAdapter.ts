import type { ExecutionRequest, ExecutionResult, RunnerExecution } from "./types";
import { assertModuleCapability } from "../capabilities";
import { createRunnerService, enforceModuleBoundary } from "../runner";
import type { RunnerInstruction } from "../runner";
import { logBoundaryCrossing, logBoundaryReturn } from "./logging";

const runnerService = createRunnerService();

export class LocalRunnerAdapter implements RunnerExecution {
  readonly adapterName = "LocalRunnerAdapter";

  async executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeWorkflowStep", request);

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

      logBoundaryReturn(this.adapterName, "executeTask", result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const result: ExecutionResult = {
        success: false,
        output: { skillName },
        logs: [`[runner] Task execution failed: ${errorMsg}`],
        error: errorMsg,
      };
      logBoundaryReturn(this.adapterName, "executeTask", result);
      return result;
    }
  }

  async executeAgentAction(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeAgentAction", request);

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
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const result: ExecutionResult = {
        success: false,
        output: { actionType },
        logs: [`[runner] Agent action failed: ${errorMsg}`],
        error: errorMsg,
      };
      logBoundaryReturn(this.adapterName, "executeAgentAction", result);
      return result;
    }
  }
}
