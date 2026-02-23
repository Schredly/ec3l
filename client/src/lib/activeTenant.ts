/**
 * Module-level tenant state — the single live source of truth for header injection.
 *
 * TenantProvider writes here on mount and on switch.
 * queryClient.ts reads here for every API request.
 * localStorage is only for persistence across page reloads.
 */

let _activeTenantSlug: string = "default";
let _activeUserId: string = "user-admin";

export function getActiveTenantSlug(): string {
  return _activeTenantSlug;
}

export function setActiveTenantSlug(slug: string): void {
  _activeTenantSlug = slug;
}

export function getActiveUserId(): string {
  return _activeUserId;
}

export function setActiveUserId(userId: string): void {
  _activeUserId = userId;
}
