import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string | null;
    }
  }
}

export function tenantResolution(req: Request, _res: Response, next: NextFunction) {
  const tenantId = req.headers["x-tenant-id"] as string | undefined;

  if (tenantId) {
    req.tenantId = tenantId;
  } else {
    req.tenantId = null;
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) {
      console.warn(`[tenant] Missing x-tenant-id header on ${req.method} ${req.path} — production warning (unscoped access)`);
    }
  }

  next();
}
