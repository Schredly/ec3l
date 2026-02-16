import http from "http";
import https from "https";
import type { ExecutionRequest, ExecutionResult, RunnerExecution } from "../types";
import { logBoundaryCrossing, logBoundaryReturn } from "../logging";

const DEFAULT_RUNNER_URL = "http://localhost:4001";
const DEFAULT_TIMEOUT_MS = 30_000;

function getRunnerUrl(): string {
  return process.env.RUNNER_URL || DEFAULT_RUNNER_URL;
}

function getTimeoutMs(): number {
  const val = process.env.RUNNER_TIMEOUT_MS;
  if (val) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function postExecute(request: ExecutionRequest): Promise<ExecutionResult> {
  const runnerUrl = getRunnerUrl();
  const timeoutMs = getTimeoutMs();

  return new Promise((resolve, reject) => {
    const url = new URL("/execute", runnerUrl);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const body = JSON.stringify(request);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    };

    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        try {
          const result = JSON.parse(raw) as ExecutionResult;
          resolve(result);
        } catch {
          resolve({
            success: false,
            output: {},
            logs: [`[remote-runner] Failed to parse runner response`],
            error: `Invalid JSON from runner: ${raw.substring(0, 200)}`,
          });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        success: false,
        output: {},
        logs: [`[remote-runner] Request timed out after ${timeoutMs}ms`],
        error: `Runner request timed out after ${timeoutMs}ms`,
      });
    });

    req.on("error", (err) => {
      resolve({
        success: false,
        output: {},
        logs: [`[remote-runner] Connection error: ${err.message}`],
        error: `Runner connection error: ${err.message}`,
      });
    });

    req.write(body);
    req.end();
  });
}

export class RemoteRunnerAdapter implements RunnerExecution {
  readonly adapterName = "RemoteRunnerAdapter";

  async executeWorkflowStep(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeWorkflowStep", request);
    const result = await postExecute(request);
    logBoundaryReturn(this.adapterName, "executeWorkflowStep", result);
    return result;
  }

  async executeTask(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeTask", request);
    const result = await postExecute(request);
    logBoundaryReturn(this.adapterName, "executeTask", result);
    return result;
  }

  async executeAgentAction(request: ExecutionRequest): Promise<ExecutionResult> {
    logBoundaryCrossing(this.adapterName, "executeAgentAction", request);
    const result = await postExecute(request);
    logBoundaryReturn(this.adapterName, "executeAgentAction", result);
    return result;
  }
}
