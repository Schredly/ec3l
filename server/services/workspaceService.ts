import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import { runnerService } from "../runner";
import type { Workspace, ChangeRecord } from "@shared/schema";

export async function getWorkspaceByChange(ctx: TenantContext, changeId: string): Promise<Workspace | undefined> {
  void ctx;
  return storage.getWorkspaceByChange(changeId);
}

export async function startWorkspace(ctx: TenantContext, change: ChangeRecord): Promise<Workspace | undefined> {
  void ctx;
  const workspace = await storage.createWorkspace({
    changeId: change.id,
    containerId: null,
    previewUrl: null,
  });

  const result = await runnerService.startWorkspace(workspace.id, change.moduleId ?? undefined);

  await storage.updateWorkspaceStatus(workspace.id, "Running", result.containerId, result.previewUrl);
  const branchName = `change/${change.id.slice(0, 8)}`;
  await storage.updateChangeStatus(change.id, "WorkspaceRunning", branchName);

  return storage.getWorkspaceByChange(change.id);
}

export async function stopWorkspace(ctx: TenantContext, workspaceId: string): Promise<void> {
  void ctx;
  await storage.updateWorkspaceStatus(workspaceId, "Stopped");
}
