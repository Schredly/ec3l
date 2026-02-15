import type { ModuleExecutionContext } from "./moduleContext";
import type { SystemContext } from "./systemContext";

export type Capability = string;

export const Capabilities = {
  FS_READ: "fs:read",
  FS_WRITE: "fs:write",
  CMD_RUN: "cmd:run",
  GIT_DIFF: "git:diff",
  NET_HTTP: "net:http",
} as const;

export class CapabilityDeniedError extends Error {
  public readonly capability: string;

  constructor(capability: string) {
    super(`Capability denied: "${capability}" is not granted in this execution context.`);
    this.name = "CapabilityDeniedError";
    this.capability = capability;
  }
}

function checkCapability(capabilities: readonly Capability[], cap: Capability): void {
  if (!capabilities.includes(cap)) {
    throw new CapabilityDeniedError(cap);
  }
}

export function assertModuleCapability(ctx: ModuleExecutionContext, cap: Capability): void {
  checkCapability(ctx.capabilities, cap);
}

export function assertSystemCapability(ctx: SystemContext, cap: Capability): void {
  checkCapability(ctx.capabilities, cap);
}
