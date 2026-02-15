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

export type ExecutionContext = ModuleExecutionContext | SystemContext;

export class CapabilityDeniedError extends Error {
  public readonly capability: string;

  constructor(capability: string) {
    super(`Capability denied: "${capability}" is not granted in this execution context.`);
    this.name = "CapabilityDeniedError";
    this.capability = capability;
  }
}

export function assertCapability(ctx: ExecutionContext, cap: Capability): void {
  if (!ctx.capabilities.includes(cap)) {
    throw new CapabilityDeniedError(cap);
  }
}
