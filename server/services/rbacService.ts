import { storage } from "../storage";
import type { TenantContext } from "../tenant";
import { isSystemContext } from "../systemContext";
import type { RbacPolicy, RbacRole, ActorIdentity, InsertRbacAuditLog } from "@shared/schema";

export class RbacDeniedError extends Error {
  public readonly permission: string;
  public readonly resourceType?: string;
  public readonly resourceId?: string;
  public readonly statusCode = 403;

  constructor(permission: string, resourceType?: string, resourceId?: string) {
    const msg = resourceId
      ? `Access denied: missing permission "${permission}" on ${resourceType}/${resourceId}`
      : resourceType
        ? `Access denied: missing permission "${permission}" on ${resourceType}`
        : `Access denied: missing permission "${permission}"`;
    super(msg);
    this.name = "RbacDeniedError";
    this.permission = permission;
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

export const PERMISSIONS = {
  FORM_VIEW: "form.view",
  FORM_EDIT: "form.edit",
  WORKFLOW_EXECUTE: "workflow.execute",
  WORKFLOW_APPROVE: "workflow.approve",
  OVERRIDE_ACTIVATE: "override.activate",
  CHANGE_APPROVE: "change.approve",
  ADMIN_VIEW: "admin.view",
  ENVIRONMENT_RELEASE_CREATE: "environment.release_create",
  ENVIRONMENT_PROMOTE: "environment.promote",
} as const;

export type PermissionName = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS: { name: string; description: string }[] = [
  { name: PERMISSIONS.FORM_VIEW, description: "View compiled forms" },
  { name: PERMISSIONS.FORM_EDIT, description: "Edit forms and create form overrides" },
  { name: PERMISSIONS.WORKFLOW_EXECUTE, description: "Execute workflows" },
  { name: PERMISSIONS.WORKFLOW_APPROVE, description: "Approve or reject workflow approval steps" },
  { name: PERMISSIONS.OVERRIDE_ACTIVATE, description: "Activate module overrides" },
  { name: PERMISSIONS.CHANGE_APPROVE, description: "Approve changes (transition to Ready/Merged)" },
  { name: PERMISSIONS.ADMIN_VIEW, description: "View the Admin Console" },
  { name: PERMISSIONS.ENVIRONMENT_RELEASE_CREATE, description: "Create environment release snapshots" },
  { name: PERMISSIONS.ENVIRONMENT_PROMOTE, description: "Approve and execute environment promotions" },
];

const DEFAULT_ROLES: { name: string; description: string; permissions: string[] }[] = [
  {
    name: "Admin",
    description: "Full access to all platform operations",
    permissions: Object.values(PERMISSIONS),
  },
  {
    name: "Editor",
    description: "Can edit forms, execute workflows, and activate overrides",
    permissions: [
      PERMISSIONS.FORM_VIEW,
      PERMISSIONS.FORM_EDIT,
      PERMISSIONS.WORKFLOW_EXECUTE,
      PERMISSIONS.OVERRIDE_ACTIVATE,
    ],
  },
  {
    name: "Viewer",
    description: "Read-only access to forms",
    permissions: [PERMISSIONS.FORM_VIEW],
  },
];

export async function seedPermissions(): Promise<void> {
  for (const perm of ALL_PERMISSIONS) {
    const existing = await storage.getRbacPermissionByName(perm.name);
    if (!existing) {
      await storage.createRbacPermission(perm.name, perm.description);
    }
  }
}

export async function seedDefaultRoles(tenantId: string): Promise<void> {
  const allPerms = await storage.getRbacPermissions();
  const permByName = new Map(allPerms.map(p => [p.name, p]));

  for (const roleDef of DEFAULT_ROLES) {
    let role = await storage.getRbacRoleByTenantAndName(tenantId, roleDef.name);
    if (!role) {
      role = await storage.createRbacRole({
        tenantId,
        name: roleDef.name,
        description: roleDef.description,
      });
    }

    const existingRolePerms = await storage.getRbacRolePermissions(role.id);
    const existingPermIds = new Set(existingRolePerms.map(rp => rp.permissionId));

    for (const permName of roleDef.permissions) {
      const perm = permByName.get(permName);
      if (perm && !existingPermIds.has(perm.id)) {
        await storage.addRbacRolePermission(role.id, perm.id);
      }
    }
  }
}

/**
 * Bootstrap RBAC for all existing tenants on server startup.
 * Seeds default roles and assigns user-admin to the Admin role
 * if not already assigned. Idempotent — safe to call on every boot.
 */
export async function bootstrapRbacForAllTenants(): Promise<void> {
  const allTenants = await storage.getTenants();
  for (const tenant of allTenants) {
    await seedDefaultRoles(tenant.id);

    const adminRole = await storage.getRbacRoleByTenantAndName(tenant.id, "Admin");
    if (!adminRole) continue;

    const existingRoles = await storage.getRbacUserRoles("user-admin");
    const alreadyAssigned = existingRoles.some(ur => ur.roleId === adminRole.id);
    if (!alreadyAssigned) {
      await storage.addRbacUserRole("user-admin", adminRole.id);
    }
  }
}

async function recordAudit(
  tenantId: string | null,
  actor: ActorIdentity,
  permission: string,
  outcome: "allow" | "deny",
  resourceType?: string,
  resourceId?: string,
  reason?: string,
): Promise<void> {
  try {
    const data: InsertRbacAuditLog = {
      tenantId,
      actorType: actor.actorType,
      actorId: actor.actorId ?? null,
      permission,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      outcome,
      reason: reason ?? null,
    };
    await storage.createRbacAuditLog(data);
  } catch (_err) {
  }
}

export async function authorize(
  ctx: TenantContext | unknown,
  actor: ActorIdentity,
  permission: string,
  resourceType?: string,
  resourceId?: string,
): Promise<void> {
  const VALID_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));
  if (typeof permission !== "string" || !VALID_PERMISSIONS.has(permission)) {
    throw new Error(`rbacService.authorize called with invalid permission: ${JSON.stringify(permission)}`);
  }

  if (isSystemContext(ctx)) {
    if (actor.actorType !== "system") {
      const tenantId = (ctx as any).tenantId ?? null;
      await recordAudit(tenantId, actor, permission, "deny", resourceType, resourceId, "non-system actor passed system context");
      throw new RbacDeniedError(permission, resourceType, resourceId);
    }
    await recordAudit(null, actor, permission, "allow", resourceType, resourceId, "system context bypass");
    return;
  }

  const tenantCtx = ctx as TenantContext;

  if (!actor.actorId) {
    await recordAudit(tenantCtx.tenantId ?? null, actor, permission, "deny", resourceType, resourceId, "missing actor identity");
    throw new RbacDeniedError(permission, resourceType, resourceId);
  }

  if (!tenantCtx.tenantId) {
    await recordAudit(null, actor, permission, "deny", resourceType, resourceId, "missing tenant context");
    throw new RbacDeniedError(permission, resourceType, resourceId);
  }

  const allRoles = await storage.getRbacUserRolesByTenant(actor.actorId, tenantCtx.tenantId);
  const roles = allRoles.filter(r => r.status === "active");

  if (roles.length === 0) {
    await recordAudit(tenantCtx.tenantId, actor, permission, "deny", resourceType, resourceId, "no active roles");
    throw new RbacDeniedError(permission, resourceType, resourceId);
  }

  const allPerms = await storage.getRbacPermissions();
  const permByName = new Map(allPerms.map(p => [p.name, p]));
  const targetPerm = permByName.get(permission);
  if (!targetPerm) {
    await recordAudit(tenantCtx.tenantId, actor, permission, "deny", resourceType, resourceId, "unknown permission");
    throw new RbacDeniedError(permission, resourceType, resourceId);
  }

  let hasPermission = false;
  const allPolicies: RbacPolicy[] = [];

  for (const role of roles) {
    const rolePerms = await storage.getRbacRolePermissions(role.id);
    if (rolePerms.some(rp => rp.permissionId === targetPerm.id)) {
      hasPermission = true;
    }

    if (resourceType) {
      const policies = await storage.getRbacPoliciesByRole(role.id);
      allPolicies.push(...policies);
    }
  }

  if (!hasPermission) {
    await recordAudit(tenantCtx.tenantId, actor, permission, "deny", resourceType, resourceId, "permission not granted by any role");
    throw new RbacDeniedError(permission, resourceType, resourceId);
  }

  if (resourceType && allPolicies.length > 0) {
    const relevantPolicies = allPolicies.filter(p => p.resourceType === resourceType);

    const hasDeny = relevantPolicies.some(p => {
      if (p.effect !== "deny") return false;
      if (p.resourceId === null) return true;
      return p.resourceId === resourceId;
    });

    if (hasDeny) {
      await recordAudit(tenantCtx.tenantId, actor, permission, "deny", resourceType, resourceId, "denied by policy");
      throw new RbacDeniedError(permission, resourceType, resourceId);
    }

    const hasAllow = relevantPolicies.some(p => {
      if (p.effect !== "allow") return false;
      if (p.resourceId === null) return true;
      return p.resourceId === resourceId;
    });

    const hasAnyPolicyForType = relevantPolicies.length > 0;
    if (hasAnyPolicyForType && !hasAllow) {
      await recordAudit(tenantCtx.tenantId, actor, permission, "deny", resourceType, resourceId, "no allow policy for resource type");
      throw new RbacDeniedError(permission, resourceType, resourceId);
    }
  }

  await recordAudit(tenantCtx.tenantId, actor, permission, "allow", resourceType, resourceId);
}

export function actorFromContext(ctx: TenantContext): ActorIdentity {
  if (!ctx.userId) {
    throw new Error("Missing user identity: provide x-user-id header");
  }
  return { actorType: "user", actorId: ctx.userId };
}

export function resolveActorFromContext(ctx: TenantContext): ActorIdentity {
  if (ctx.agentId) {
    return { actorType: "agent", actorId: ctx.agentId };
  }
  if (ctx.userId) {
    return { actorType: "user", actorId: ctx.userId };
  }
  throw new Error("Missing actor identity: provide x-user-id or x-agent-id header");
}

export function agentActor(agentId: string): ActorIdentity {
  return { actorType: "agent", actorId: agentId };
}

export function systemActor(): ActorIdentity {
  return { actorType: "system", actorId: null };
}

export async function getUserRolesForTenant(userId: string, tenantId: string): Promise<RbacRole[]> {
  return storage.getRbacUserRolesByTenant(userId, tenantId);
}
