import type { TenantContext } from "../tenant";
import type { ModuleExecutionContext } from "../moduleContext";
import { getTenantStorage } from "../tenantStorage";
import type { Workspace, ChangeRecord } from "@shared/schema";
import { getRunnerExecution, buildExecutionRequest } from "../execution";

export async function getWorkspaceByChange(ctx: TenantContext, changeId: string): Promise<Workspace | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getWorkspaceByChange(changeId);
}

export async function startWorkspace(ctx: TenantContext, change: ChangeRecord, moduleCtx: ModuleExecutionContext): Promise<Workspace | undefined> {
  const ts = getTenantStorage(ctx);
  const runner = getRunnerExecution();

  const workspace = await ts.createWorkspace({
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

  await ts.updateWorkspaceStatus(workspace.id, "Running", containerId, previewUrl);
  const branchName = `change/${change.id.slice(0, 8)}`;
  await ts.updateChangeStatus(change.id, "WorkspaceRunning", branchName);

  return ts.getWorkspaceByChange(change.id);
}

export async function stopWorkspace(ctx: TenantContext, workspaceId: string): Promise<void> {
  const ts = getTenantStorage(ctx);
  await ts.updateWorkspaceStatus(workspaceId, "Stopped");
}
