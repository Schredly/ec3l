import type { Request } from "express";
export type { TenantContext } from "@shared/executionTypes";
import type { TenantContext } from "@shared/executionTypes";

export class TenantResolutionError extends Error {
  constructor(message = "Missing tenant context") {
    super(message);
    this.name = "TenantResolutionError";
  }
}

export function resolveTenantContext(req: Request): TenantContext {
  const tenantId = req.headers["x-tenant-id"] as string | undefined;
  if (!tenantId) {
    throw new TenantResolutionError();
  }
  const userId = req.headers["x-user-id"] as string | undefined;
  const agentId = req.headers["x-agent-id"] as string | undefined;
  return { tenantId, userId, agentId, source: "header" };
}
