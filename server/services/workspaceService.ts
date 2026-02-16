import type { TenantContext } from "../tenant";
import type { ModuleExecutionContext } from "../moduleContext";
import { storage } from "../storage";
import type { Workspace, ChangeRecord } from "@shared/schema";
import { getRunnerExecution, buildExecutionRequest } from "../execution";

export async function getWorkspaceByChange(ctx: TenantContext, changeId: string): Promise<Workspace | undefined> {
  void ctx;
  return storage.getWorkspaceByChange(changeId);
}

export async function startWorkspace(ctx: TenantContext, change: ChangeRecord, moduleCtx: ModuleExecutionContext): Promise<Workspace | undefined> {
  void ctx;
  const runner = getRunnerExecution();

  const workspace = await storage.createWorkspace({
    changeId: change.id,
    containerId: null,
    previewUrl: null,
  });

  const request = buildExecutionRequest({
    moduleExecutionContext: moduleCtx,
    requestedAction: "workspace_start",
    inputPayload: {
      actionType: "start_workspace",
      workspaceId: workspace.id,
      changeId: change.id,
    },
  });

  const result = await runner.executeAgentAction(request);

  const containerId = result.output.containerId as string | undefined;
  const previewUrl = result.output.previewUrl as string | undefined;

  await storage.updateWorkspaceStatus(workspace.id, "Running", containerId, previewUrl);
  const branchName = `change/${change.id.slice(0, 8)}`;
  await storage.updateChangeStatus(change.id, "WorkspaceRunning", branchName);

  return storage.getWorkspaceByChange(change.id);
}

export async function stopWorkspace(ctx: TenantContext, workspaceId: string): Promise<void> {
  void ctx;
  await storage.updateWorkspaceStatus(workspaceId, "Stopped");
}
