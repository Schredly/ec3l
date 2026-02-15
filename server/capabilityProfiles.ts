import type { Capability } from "./capabilities";
import { Capabilities } from "./capabilities";

export type CapabilityProfileName =
  | "CODE_MODULE_DEFAULT"
  | "WORKFLOW_MODULE_DEFAULT"
  | "READ_ONLY"
  | "SYSTEM_PRIVILEGED";

export const CapabilityProfiles: Record<CapabilityProfileName, Capability[]> = {
  CODE_MODULE_DEFAULT: [
    Capabilities.FS_READ,
    Capabilities.FS_WRITE,
    Capabilities.CMD_RUN,
    Capabilities.GIT_DIFF,
  ],
  WORKFLOW_MODULE_DEFAULT: [
    Capabilities.FS_READ,
    Capabilities.CMD_RUN,
  ],
  READ_ONLY: [
    Capabilities.FS_READ,
  ],
  SYSTEM_PRIVILEGED: [
    Capabilities.FS_READ,
    Capabilities.FS_WRITE,
    Capabilities.CMD_RUN,
    Capabilities.GIT_DIFF,
    Capabilities.NET_HTTP,
  ],
};

export function resolveProfile(profileName: CapabilityProfileName): Capability[] {
  const caps = CapabilityProfiles[profileName];
  if (!caps) {
    throw new Error(`Unknown capability profile: "${profileName}"`);
  }
  return [...caps];
}
