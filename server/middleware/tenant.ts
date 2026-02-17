import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "@shared/schema";
import type { TenantContext } from "../tenant";

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

/**
 * Resolves the x-tenant-id header (slug) to a tenant UUID.
 *
 * Headers carry a tenant slug (e.g. "default"), but DB foreign keys
 * reference tenants.id (UUID). This middleware resolves slug → UUID
 * so all downstream code (services, storage) receives the UUID.
 */
export async function tenantResolution(req: Request, res: Response, next: NextFunction) {
  const slug = req.headers["x-tenant-id"] as string | undefined;
  if (!slug) {
    return res.status(401).json({ message: "Missing tenant context" });
  }

  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug));
    if (!tenant) {
      return res.status(404).json({ message: `Tenant "${slug}" not found` });
    }

    const userId = req.headers["x-user-id"] as string | undefined;
    const agentId = req.headers["x-agent-id"] as string | undefined;

    req.tenantContext = {
      tenantId: tenant.id, // UUID — never the slug
      userId,
      agentId,
      source: "header",
    };
    next();
  } catch (err) {
    next(err);
  }
}
