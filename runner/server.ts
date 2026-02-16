import http from "http";
import type { ExecutionRequest, ExecutionResult } from "./types";
import { LocalRunnerAdapter } from "./adapters/localRunnerAdapter";

const adapter = new LocalRunnerAdapter();

function routeExecution(request: ExecutionRequest): Promise<ExecutionResult> {
  switch (request.requestedAction) {
    case "workflow_step":
      return adapter.executeWorkflowStep(request);
    case "agent_task":
      return adapter.executeTask(request);
    case "agent_action":
      return adapter.executeAgentAction(request);
    case "workspace_start":
    case "workspace_stop":
      return adapter.executeAgentAction(request);
    case "skill_invoke":
      return adapter.executeTask(request);
    default:
      return Promise.resolve({
        success: false,
        output: {},
        logs: [`[runner-server] Unknown action: ${request.requestedAction}`],
        error: `Unknown requestedAction: ${request.requestedAction}`,
      });
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

export function createRunnerHttpServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/execute") {
      try {
        const rawBody = await readBody(req);
        let executionRequest: ExecutionRequest;

        try {
          executionRequest = JSON.parse(rawBody) as ExecutionRequest;
        } catch {
          sendJson(res, 400, { error: "Invalid JSON body" });
          return;
        }

        if (!executionRequest.tenantContext || !executionRequest.moduleExecutionContext) {
          sendJson(res, 400, { error: "Missing required fields: tenantContext, moduleExecutionContext" });
          return;
        }

        const result = await routeExecution(executionRequest);
        sendJson(res, 200, result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Internal runner error";
        console.error(`[runner-server] Unhandled error on POST /execute: ${errorMsg}`);
        sendJson(res, 500, {
          success: false,
          output: {},
          logs: [`[runner-server] Internal error: ${errorMsg}`],
          error: errorMsg,
        } satisfies ExecutionResult);
      }
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { status: "ok", adapter: "LocalRunnerAdapter" });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  return server;
}
