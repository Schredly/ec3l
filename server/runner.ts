import { randomBytes } from "crypto";
import path from "path";

export interface RunnerInstruction {
  workspaceId: string;
  moduleId?: string;
  moduleRootPath?: string;
  command: string;
}

export interface RunnerResult {
  success: boolean;
  logs: string[];
  containerId?: string;
  previewUrl?: string;
}

export interface IRunnerService {
  startWorkspace(workspaceId: string, moduleId?: string): Promise<RunnerResult>;
  runCommand(instruction: RunnerInstruction): Promise<RunnerResult>;
  getDiff(workspaceId: string): Promise<RunnerResult>;
  getLogs(workspaceId: string): Promise<RunnerResult>;
  validateFilePath(filePath: string, moduleRootPath: string): { valid: boolean; reason?: string };
}

export class SimulatedRunnerService implements IRunnerService {
  validateFilePath(filePath: string, moduleRootPath: string): { valid: boolean; reason?: string } {
    const normalizedFile = path.posix.normalize(filePath).replace(/^\/+/, "").replace(/\/+$/, "");
    const normalizedRoot = path.posix.normalize(moduleRootPath).replace(/^\/+/, "").replace(/\/+$/, "");

    if (normalizedFile.startsWith("..") || normalizedFile.includes("/../")) {
      return {
        valid: false,
        reason: `Path "${filePath}" contains path traversal — denied.`,
      };
    }

    if (!normalizedFile.startsWith(normalizedRoot + "/") && normalizedFile !== normalizedRoot) {
      return {
        valid: false,
        reason: `Path "${filePath}" is outside module scope "${moduleRootPath}". Changes are restricted to the module's rootPath.`,
      };
    }
    return { valid: true };
  }

  async startWorkspace(workspaceId: string, _moduleId?: string): Promise<RunnerResult> {
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

  async runCommand(instruction: RunnerInstruction): Promise<RunnerResult> {
    if (instruction.moduleRootPath) {
      const commandParts = instruction.command.split(" ");
      const targetPath = commandParts[commandParts.length - 1];
      if (targetPath && targetPath.includes("/")) {
        const check = this.validateFilePath(targetPath, instruction.moduleRootPath);
        if (!check.valid) {
          console.warn(`[runner] Module scope violation: ${check.reason}`);
          return {
            success: false,
            logs: [
              `[runner] Executing in workspace ${instruction.workspaceId}`,
              `[runner] DENIED: ${check.reason}`,
              `[runner] Command rejected — module scope violation`,
            ],
          };
        }
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

  async getDiff(workspaceId: string): Promise<RunnerResult> {
    return {
      success: true,
      logs: [
        `[runner] Fetching diff for workspace ${workspaceId}`,
        `[runner] No uncommitted changes`,
      ],
    };
  }

  async getLogs(workspaceId: string): Promise<RunnerResult> {
    return {
      success: true,
      logs: [
        `[runner] Streaming logs for workspace ${workspaceId}`,
      ],
    };
  }
}

export const runnerService: IRunnerService = new SimulatedRunnerService();
