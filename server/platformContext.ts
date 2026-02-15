import { createSystemContext, type SystemContext } from "./systemContext";

const contextCache = new Map<string, SystemContext>();

export function getSystemContext(reason: string): SystemContext {
  const cached = contextCache.get(reason);
  if (cached) return cached;
  const ctx = createSystemContext(reason);
  contextCache.set(reason, ctx);
  return ctx;
}

export const PlatformContexts = {
  templateRead: () => getSystemContext("read-only template access"),
  templateInstall: () => getSystemContext("template installation"),
  installedAppsRead: () => getSystemContext("list installed apps"),
} as const;
