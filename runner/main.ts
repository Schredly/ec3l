import { createRunnerHttpServer } from "./server";
import { configureRunnerTelemetry } from "./telemetry";
import type { RunnerTelemetrySink, TelemetryEventData } from "./telemetry";

const RUNNER_PORT = parseInt(process.env.RUNNER_PORT || "4001", 10);

const consoleTelemetrySink: RunnerTelemetrySink = {
  async emit(event: TelemetryEventData): Promise<void> {
    console.log(`[runner-telemetry] ${event.eventType} | exec=${event.executionId} tenant=${event.tenantId} module=${event.moduleId} type=${event.executionType} status=${event.status}${event.errorCode ? ` errorCode=${event.errorCode}` : ""}${event.errorMessage ? ` errorMessage=${event.errorMessage}` : ""}`);
  },
};

configureRunnerTelemetry(consoleTelemetrySink);
console.log("[runner] Telemetry sink configured (console)");

const server = createRunnerHttpServer();

server.listen(RUNNER_PORT, "0.0.0.0", () => {
  console.log(`[runner] Standalone runner listening on 0.0.0.0:${RUNNER_PORT}`);
  console.log(`[runner] POST /execute — accepts ExecutionRequest, returns ExecutionResult`);
  console.log(`[runner] GET  /health  — health check`);
});

process.on("SIGTERM", () => {
  console.log("[runner] SIGTERM received, shutting down...");
  server.close(() => {
    console.log("[runner] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[runner] SIGINT received, shutting down...");
  server.close(() => {
    console.log("[runner] Server closed");
    process.exit(0);
  });
});
