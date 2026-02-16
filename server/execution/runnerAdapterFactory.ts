import type { RunnerExecution } from "./types";
import { LocalRunnerAdapter } from "./localRunnerAdapter";
import { RemoteRunnerAdapter } from "./remoteRunnerAdapter";

export type RunnerAdapterType = "local" | "remote";

let runnerExecution: RunnerExecution | null = null;
let activeAdapterType: RunnerAdapterType | null = null;

function resolveAdapterType(): RunnerAdapterType {
  const configured = (process.env.RUNNER_ADAPTER || "local").toLowerCase();
  if (configured === "remote") return "remote";
  return "local";
}

function createAdapter(adapterType: RunnerAdapterType): RunnerExecution {
  switch (adapterType) {
    case "remote":
      return new RemoteRunnerAdapter();
    case "local":
    default:
      return new LocalRunnerAdapter();
  }
}

export function getRunnerExecution(): RunnerExecution {
  if (!runnerExecution) {
    activeAdapterType = resolveAdapterType();
    runnerExecution = createAdapter(activeAdapterType);
    console.log(`[runner-adapter] Using ${activeAdapterType === "local" ? "LocalRunnerAdapter" : "RemoteRunnerAdapter"} (RUNNER_ADAPTER=${activeAdapterType})`);
  }
  return runnerExecution;
}

export function getActiveAdapterType(): RunnerAdapterType | null {
  return activeAdapterType;
}
