export type { TenantContext } from "@shared/executionTypes";
import type { TenantContext } from "@shared/executionTypes";

export class TenantResolutionError extends Error {
  constructor(message = "Missing tenant context") {
    super(message);
    this.name = "TenantResolutionError";
  }
}

/**
 * Build a TenantContext for non-HTTP callers (e.g. background jobs, tests).
 * For HTTP requests, use the tenantResolution middleware instead — it
 * resolves the x-tenant-id slug to the tenant UUID automatically.
 */
export function buildTenantContext(
  tenantId: string,
  opts: { userId?: string; agentId?: string } = {},
): TenantContext {
  return { tenantId, userId: opts.userId, agentId: opts.agentId, source: "system" };
}
