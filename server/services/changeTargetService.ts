import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangeTarget, InsertChangeTarget } from "@shared/schema";

export class ChangeTargetServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ChangeTargetServiceError";
    this.statusCode = statusCode;
  }
}

export async function createChangeTarget(
  ctx: TenantContext,
  changeId: string,
  data: Omit<InsertChangeTarget, "tenantId" | "changeId" | "projectId">,
): Promise<ChangeTarget> {
  const ts = getTenantStorage(ctx);

  const change = await ts.getChange(changeId);
  if (!change) {
    throw new ChangeTargetServiceError("Change not found", 404);
  }

  const project = await ts.getProject(change.projectId);
  if (!project) {
    throw new ChangeTargetServiceError("Project not found for this change", 404);
  }

  return ts.createChangeTarget({
    tenantId: ctx.tenantId,
    projectId: change.projectId,
    changeId,
    type: data.type,
    selector: data.selector,
  });
}

export async function listChangeTargets(
  ctx: TenantContext,
  changeId: string,
): Promise<ChangeTarget[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangeTargetsByChange(changeId);
}
