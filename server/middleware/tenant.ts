import type { Request, Response, NextFunction } from "express";
import { resolveTenantContext, TenantResolutionError, type TenantContext } from "../tenant";

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

export function tenantResolution(req: Request, res: Response, next: NextFunction) {
  try {
    req.tenantContext = resolveTenantContext(req);
    next();
  } catch (err) {
    if (err instanceof TenantResolutionError) {
      return res.status(401).json({ message: "Missing tenant context" });
    }
    next(err);
  }
}
