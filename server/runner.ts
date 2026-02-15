import { randomBytes } from "crypto";
import path from "path";
import type { ModuleExecutionContext } from "./moduleContext";

export interface RunnerInstruction {
  workspaceId: string;
  moduleId?: string;
  moduleRootPath?: string;
  command: string;
  targetPath?: string;
}

export interface RunnerResult {
  success: boolean;
  logs: string[];
  containerId?: string;
  previewUrl?: string;
}

export function enforceModuleBoundary(moduleCtx: ModuleExecutionContext, requestedPath: string): void {
  const moduleRootPath = moduleCtx.moduleRootPath;
  const normalized = path.posix.normalize(requestedPath);

  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`Absolute path "${requestedPath}" is not allowed — paths must be relative to module root.`);
  }

  if (normalized.startsWith("..") || normalized.includes("/../") || normalized === "..") {
    throw new Error(`Path "${requestedPath}" contains path traversal — denied.`);
  }

  const normalizedRoot = path.posix.normalize(moduleRootPath).replace(/^\/+/, "").replace(/\/+$/, "");
  const normalizedReq = normalized.replace(/^\/+/, "").replace(/\/+$/, "");

  const resolved = path.posix.resolve(normalizedRoot, normalizedReq);
  const resolvedRoot = path.posix.resolve(normalizedRoot);

  if (!resolved.startsWith(resolvedRoot + "/") && resolved !== resolvedRoot) {
    throw new Error(`Path "${requestedPath}" resolves outside module scope "${moduleRootPath}" — denied.`);
  }
}

export interface IRunnerService {
  startWorkspace(workspaceId: string, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  runCommand(instruction: RunnerInstruction, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  getDiff(workspaceId: string, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  getLogs(workspaceId: string, moduleCtx: ModuleExecutionContext): Promise<RunnerResult>;
  validateFilePath(filePath: string, moduleCtx: ModuleExecutionContext): { valid: boolean; reason?: string };
}

export class SimulatedRunnerService implements IRunnerService {
  validateFilePath(filePath: string, moduleCtx: ModuleExecutionContext): { valid: boolean; reason?: string } {
    const moduleRootPath = moduleCtx.moduleRootPath;
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
    if (instruction.moduleRootPath && instruction.targetPath) {
      try {
        enforceModuleBoundary(moduleCtx, instruction.targetPath);
      } catch (err: any) {
        console.warn(`[runner] Module boundary violation: ${err.message}`);
        return {
          success: false,
          logs: [
            `[runner] Executing in workspace ${instruction.workspaceId}`,
            `[runner] SECURITY: ${err.message}`,
            `[runner] Command rejected — module boundary violation`,
          ],
        };
      }
    } else if (instruction.moduleRootPath) {
      const commandParts = instruction.command.split(" ");
      const targetPath = commandParts[commandParts.length - 1];
      if (targetPath && targetPath.includes("/")) {
        const check = this.validateFilePath(targetPath, moduleCtx);
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

export const runnerService: IRunnerService = new SimulatedRunnerService();
