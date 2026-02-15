import { randomBytes } from "crypto";

export interface RunnerInstruction {
  workspaceId: string;
  moduleId?: string;
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
}

export class SimulatedRunnerService implements IRunnerService {
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
