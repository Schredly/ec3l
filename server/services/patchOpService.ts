import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangePatchOp } from "@shared/schema";

export class PatchOpServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PatchOpServiceError";
    this.statusCode = statusCode;
  }
}

export async function createPatchOp(
  ctx: TenantContext,
  changeId: string,
  targetId: string,
  opType: string,
  payload: unknown,
): Promise<ChangePatchOp> {
  const ts = getTenantStorage(ctx);

  const change = await ts.getChange(changeId);
  if (!change) {
    throw new PatchOpServiceError("Change not found", 404);
  }

  const target = await ts.getChangeTarget(targetId);
  if (!target) {
    throw new PatchOpServiceError("Change target not found", 404);
  }

  if (target.changeId !== changeId) {
    throw new PatchOpServiceError("Target does not belong to this change", 400);
  }

  if (opType === "edit_file") {
    if (target.type !== "file") {
      throw new PatchOpServiceError(
        'edit_file operations require a target of type "file"',
        400,
      );
    }
  }

  return ts.createChangePatchOp({
    tenantId: ctx.tenantId,
    changeId,
    targetId,
    opType,
    payload: payload as Record<string, unknown>,
  });
}

export async function listPatchOps(
  ctx: TenantContext,
  changeId: string,
): Promise<ChangePatchOp[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangePatchOpsByChange(changeId);
}
