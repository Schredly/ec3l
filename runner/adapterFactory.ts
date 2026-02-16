import type { RunnerExecution } from "./types";
import { LocalRunnerAdapter } from "./adapters/localRunnerAdapter";
import { RemoteRunnerAdapter } from "./adapters/remoteRunnerAdapter";

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
    if (activeAdapterType === "remote") {
      const url = process.env.RUNNER_URL || "http://localhost:4001";
      console.log(`[runner-adapter] Using RemoteRunnerAdapter (RUNNER_ADAPTER=remote, RUNNER_URL=${url})`);
    } else {
      console.log(`[runner-adapter] Using LocalRunnerAdapter (RUNNER_ADAPTER=local)`);
    }
  }
  return runnerExecution;
}

export function getActiveAdapterType(): RunnerAdapterType | null {
  return activeAdapterType;
}
