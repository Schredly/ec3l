import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { Environment, ActorIdentity } from "@shared/schema";

export class ReleaseServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ReleaseServiceError";
    this.statusCode = statusCode;
  }
}

export async function getEnvironmentsByProject(ctx: TenantContext, projectId: string): Promise<Environment[]> {
  const ts = getTenantStorage(ctx);
  return ts.getEnvironmentsByProject(projectId);
}

export async function getEnvironment(ctx: TenantContext, id: string): Promise<Environment | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getEnvironment(id);
}

/**
 * Create an immutable release snapshot of all eligible merged changes
 * for the given environment.
 *
 * Eligible = status 'Merged', environment_id matches, not already
 * included in a prior release for this environment.
 *
 * Idempotency: if no new eligible changes exist, rejects with 409.
 */
export async function createReleaseSnapshot(
  ctx: TenantContext,
  environmentId: string,
  actor: ActorIdentity,
): Promise<{
  id: string;
  environmentId: string;
  projectId: string;
  createdBy: string | null;
  createdAt: Date;
  changeIds: string[];
}> {
  const ts = getTenantStorage(ctx);

  // 1. Validate environment exists (tenant-scoped)
  const environment = await ts.getEnvironment(environmentId);
  if (!environment) {
    throw new ReleaseServiceError("Environment not found", 404);
  }

  // 2. Query eligible changes
  const eligibleChanges = await ts.getEligibleChangesForRelease(environmentId);

  if (eligibleChanges.length === 0) {
    throw new ReleaseServiceError(
      "No eligible merged changes for release",
      409,
    );
  }

  // 3. Create release row
  const release = await ts.createEnvironmentRelease({
    projectId: environment.projectId,
    environmentId,
    createdBy: actor.actorId ?? null,
  });

  // 4. Insert release → change mappings
  const changeIds = eligibleChanges.map((c) => c.id);
  await ts.createEnvironmentReleaseChanges(release.id, changeIds);

  return {
    id: release.id,
    environmentId: release.environmentId,
    projectId: release.projectId,
    createdBy: release.createdBy,
    createdAt: release.createdAt,
    changeIds,
  };
}
