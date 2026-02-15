import { randomBytes } from "crypto";
import path from "path";
import type { ModuleExecutionContext } from "./moduleContext";
import { ModuleBoundaryViolationError } from "./moduleContext";

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

export function enforceModuleBoundary(moduleCtx: ModuleExecutionContext, requestedPath: string): void {
  const moduleRootPath = moduleCtx.moduleRootPath;
  const normalized = path.posix.normalize(requestedPath);

  if (path.posix.isAbsolute(normalized)) {
    throw new ModuleBoundaryViolationError({
      moduleId: moduleCtx.moduleId,
      attemptedPath: requestedPath,
      reason: `Absolute path "${requestedPath}" is not allowed — paths must be relative to module root.`,
    });
  }

  if (normalized.startsWith("..") || normalized.includes("/../") || normalized === "..") {
    throw new ModuleBoundaryViolationError({
      moduleId: moduleCtx.moduleId,
      attemptedPath: requestedPath,
      reason: `Path "${requestedPath}" contains path traversal — denied.`,
    });
  }

  const normalizedRoot = path.posix.normalize(moduleRootPath).replace(/^\/+/, "").replace(/\/+$/, "");
  const normalizedReq = normalized.replace(/^\/+/, "").replace(/\/+$/, "");

  const resolved = path.posix.resolve(normalizedReq);
  const resolvedRoot = path.posix.resolve(normalizedRoot);

  if (!resolved.startsWith(resolvedRoot + "/") && resolved !== resolvedRoot) {
    throw new ModuleBoundaryViolationError({
      moduleId: moduleCtx.moduleId,
      attemptedPath: requestedPath,
      reason: `Path "${requestedPath}" resolves outside module scope "${moduleRootPath}" — denied.`,
    });
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
    try {
      enforceModuleBoundary(moduleCtx, filePath);
      return { valid: true };
    } catch (err) {
      if (err instanceof ModuleBoundaryViolationError) {
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
      enforceModuleBoundary(moduleCtx, instruction.targetPath);
    } else if (moduleCtx.moduleRootPath) {
      const commandParts = instruction.command.split(" ");
      const targetPath = commandParts[commandParts.length - 1];
      if (targetPath && targetPath.includes("/")) {
        enforceModuleBoundary(moduleCtx, targetPath);
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
