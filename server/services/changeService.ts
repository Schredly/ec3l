import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangeRecord, InsertChangeRecord } from "@shared/schema";
import { executePatchOps, PatchOpExecutionError } from "../executors/patchOpExecutor";

/**
 * Deterministic Change lifecycle.
 * Control-plane invariant: no implicit jumps, no ad-hoc state.
 */
const ALLOWED_TRANSITIONS: Record<
  ChangeRecord["status"],
  ReadonlyArray<ChangeRecord["status"]>
> = {
  Draft: ["Implementing"],
  Implementing: ["WorkspaceRunning", "Validating", "Draft"],
  WorkspaceRunning: ["Validating", "Implementing"],
  Validating: ["Ready", "ValidationFailed"],
  ValidationFailed: ["Implementing", "Validating"],
  Ready: ["Merged"],
  Merged: [],
};

function assertTransitionAllowed(
  from: ChangeRecord["status"],
  to: ChangeRecord["status"],
): void {
  if (from === to) return; // idempotent
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ChangeServiceError(
      `Invalid change status transition "${from}" → "${to}"`,
      409,
    );
  }
}

export async function getChangesByProject(
  ctx: TenantContext,
  projectId: string,
): Promise<ChangeRecord[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangesByProject(projectId);
}

export async function getChanges(ctx: TenantContext): Promise<ChangeRecord[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChanges();
}

export async function getChange(
  ctx: TenantContext,
  id: string,
): Promise<ChangeRecord | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getChange(id);
}

export async function createChange(
  ctx: TenantContext,
  data: InsertChangeRecord,
): Promise<ChangeRecord> {
  const ts = getTenantStorage(ctx);
  const project = await ts.getProject(data.projectId);
  if (!project) {
    throw new ChangeServiceError("Project not found", 404);
  }

  const resolved = { ...data };

  if (resolved.moduleId) {
    const mod = await ts.getModule(resolved.moduleId);
    if (!mod) throw new ChangeServiceError("Module not found", 400);
    if (!resolved.modulePath) {
      resolved.modulePath = mod.rootPath;
    }
  } else if (resolved.modulePath) {
    let mod = await ts.getModuleByProjectAndPath(resolved.projectId, resolved.modulePath);
    if (!mod) {
      console.log(
        `[module-resolve] Auto-creating module for path "${resolved.modulePath}" in project ${resolved.projectId}`,
      );
      const name = resolved.modulePath.split("/").pop() || "default";
      mod = await ts.createModule({
        projectId: resolved.projectId,
        name,
        type: "code",
        rootPath: resolved.modulePath,
      });
    } else {
      console.log(
        `[module-resolve] Resolved existing module "${mod.name}" (${mod.id}) for path "${resolved.modulePath}"`,
      );
    }
    resolved.moduleId = mod.id;
  }

  if (!resolved.environmentId) {
    const defaultEnv = await ts.getDefaultEnvironment(resolved.projectId);
    if (defaultEnv) {
      resolved.environmentId = defaultEnv.id;
    }
  }

  return ts.createChange(resolved);
}

export async function updateChangeStatus(
  ctx: TenantContext,
  id: string,
  nextStatus: ChangeRecord["status"],
  branchName?: string,
): Promise<ChangeRecord | undefined> {
  const ts = getTenantStorage(ctx);

  const change = await ts.getChange(id);
  if (!change) return undefined;

  // Enforce deterministic state machine
  assertTransitionAllowed(change.status, nextStatus);

  // Merging is special: it MUST execute PatchOps as the merge action.
  if (nextStatus === "Merged") {
    try {
      const result = await executePatchOps(ctx, id);
      if (!result.success) {
        await ts.updateChangeStatus(id, "ValidationFailed");
        throw new ChangeServiceError(
          `Patch op execution failed: ${result.error}`,
          422,
        );
      }
    } catch (err) {
      if (err instanceof PatchOpExecutionError) {
        await ts.updateChangeStatus(id, "ValidationFailed");
        throw new ChangeServiceError(
          `Patch op execution failed: ${err.message}`,
          422,
        );
      }
      throw err;
    }

    return ts.updateChangeStatus(id, "Merged", branchName);
  }

  return ts.updateChangeStatus(id, nextStatus, branchName);
}

export class ChangeServiceError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "ChangeServiceError";
  }
}
