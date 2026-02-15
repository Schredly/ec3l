import type { Capability } from "./capabilities";
import { resolveProfile } from "./capabilityProfiles";

const SYSTEM_BRAND = Symbol("SystemContext");

export type SystemContext = {
  readonly [SYSTEM_BRAND]: true;
  readonly source: "system";
  readonly reason: string;
  readonly capabilities: Capability[];
};

export function createSystemContext(reason: string): SystemContext {
  return {
    [SYSTEM_BRAND]: true,
    source: "system",
    reason,
    capabilities: resolveProfile("SYSTEM_PRIVILEGED"),
  };
}

export function isSystemContext(ctx: unknown): ctx is SystemContext {
  return (
    typeof ctx === "object" &&
    ctx !== null &&
    "source" in ctx &&
    (ctx as Record<string, unknown>).source === "system" &&
    SYSTEM_BRAND in ctx
  );
}
