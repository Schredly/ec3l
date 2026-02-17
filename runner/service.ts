import { randomBytes } from "crypto";
import type { ModuleExecutionContext } from "@shared/executionTypes";
import { validateModuleBoundaryPath } from "./boundaryGuard";
import { ModuleBoundaryEscapeError } from "./boundaryErrors";

export interface RunnerInstruction {
  workspaceId: string;
  command: string;
  targetPath?: string;
}

export interface RunnerResult {
  success: boolean;
  logs: string[];
  containerId?: string;
  previewUrl?: string;
  failureReason?: string;
}

export interface IRunnerService {
  startWorkspace(workspaceId: string, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  runCommand(instruction: RunnerInstruction, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  getDiff(workspaceId: string, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  getLogs(workspaceId: string, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  validateFilePath(filePath: string, moduleCtx: ModuleExecutionContext): { valid: boolean; reason?: string };
}

class SimulatedRunnerService implements IRunnerService {
  validateFilePath(filePath: string, moduleCtx: ModuleExecutionContext): { valid: boolean; reason?: string } {
    try {
      validateModuleBoundaryPath(moduleCtx.moduleId, moduleCtx.moduleRootPath, filePath);
      return { valid: true };
    } catch (err) {
      if (err instanceof ModuleBoundaryEscapeError) {
        return { valid: false, reason: err.reason };
      }
      throw err;
    }
  }

  async startWorkspace(workspaceId: string, _moduleCtx: ModuleExecutionContext): Promise<RunnerResult> {
    const containerId = `ws-${randomBytes(6).toString("hex")}`;
    const previewUrl = `https://preview-${containerId}.ec3l.dev`;
    return {
      success: true,
      logs: [
        `[runner] Starting workspace ${workspaceId}`,
        `[runner] Container ${containerId} provisioned`,
        `[runner] Preview available at ${previewUrl}`,
      ],
      containerId,
      previewUrl,
    };
  }

  async runCommand(instruction: RunnerInstruction, moduleCtx: ModuleExecutionContext): Promise<RunnerResult> {
    if (moduleCtx.moduleRootPath && instruction.targetPath) {
      validateModuleBoundaryPath(moduleCtx.moduleId, moduleCtx.moduleRootPath, instruction.targetPath);
    } else if (moduleCtx.moduleRootPath) {
      const commandParts = instruction.command.split(" ");
      const targetPath = commandParts[commandParts.length - 1];
      if (targetPath && targetPath.includes("/")) {
        validateModuleBoundaryPath(moduleCtx.moduleId, moduleCtx.moduleRootPath, targetPath);
      }
    }

    return {
      success: true,
      logs: [
        `[runner] Executing in workspace ${instruction.workspaceId}`,
        `[runner] Command: ${instruction.command}`,
        `[runner] Exit code: 0`,
      ],
    };
  }

  async getDiff(workspaceId: string, _moduleCtx: ModuleExecutionContext): Promise<RunnerResult> {
    return {
      success: true,
      logs: [
        `[runner] Fetching diff for workspace ${workspaceId}`,
        `[runner] No uncommitted changes`,
      ],
    };
  }

  async getLogs(workspaceId: string, _moduleCtx: ModuleExecutionContext): Promise<RunnerResult> {
    return {
      success: true,
      logs: [
        `[runner] Streaming logs for workspace ${workspaceId}`,
      ],
    };
  }
}

export function createRunnerService(): IRunnerService {
  return new SimulatedRunnerService();
}
