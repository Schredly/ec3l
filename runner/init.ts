import type { RunnerTelemetrySink } from "./telemetry";
import { configureRunnerTelemetry } from "./telemetry";
import { getRunnerExecution, getActiveAdapterType } from "./adapterFactory";
import type { RunnerExecution } from "./types";
import type { RunnerAdapterType } from "./adapterFactory";

export type RunnerConfig = {
  telemetrySink?: RunnerTelemetrySink;
};

export type RunnerInstance = {
  execution: RunnerExecution;
  adapterType: RunnerAdapterType | null;
};

export function initRunner(config: RunnerConfig = {}): RunnerInstance {
  if (config.telemetrySink) {
    configureRunnerTelemetry(config.telemetrySink);
    console.log("[runner] Telemetry sink configured");
  }

  const execution = getRunnerExecution();
  const adapterType = getActiveAdapterType();

  console.log(`[runner] Initialized with adapter=${adapterType}`);

  return { execution, adapterType };
}
