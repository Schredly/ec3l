import { randomUUID } from "crypto";
import type { ExecutionRequest, ExecutionResult } from "./types";

export type TelemetryEventData = {
  eventType: "execution_started" | "execution_completed" | "execution_failed";
  tenantId: string;
  moduleId: string;
  executionType: "workflow_step" | "task" | "agent_action";
  workflowId: string | null;
  workflowStepId: string | null;
  executionId: string;
  actorType: "user" | "agent" | "system";
  actorId: string | null;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  affectedRecordIds?: unknown;
};

export interface RunnerTelemetrySink {
  emit(event: TelemetryEventData): Promise<void>;
}

class NoopTelemetrySink implements RunnerTelemetrySink {
  async emit(_event: TelemetryEventData): Promise<void> {}
}

let activeSink: RunnerTelemetrySink = new NoopTelemetrySink();

export function configureRunnerTelemetry(sink: RunnerTelemetrySink): void {
  activeSink = sink;
}

function resolveActorType(request: ExecutionRequest): "user" | "agent" | "system" {
  if (request.tenantContext.agentId) return "agent";
  if (request.tenantContext.userId) return "user";
  return "system";
}

function resolveActorId(request: ExecutionRequest): string | null {
  if (request.tenantContext.agentId) return request.tenantContext.agentId;
  if (request.tenantContext.userId) return request.tenantContext.userId;
  return null;
}

function resolveExecutionType(method: string): "workflow_step" | "task" | "agent_action" {
  switch (method) {
    case "executeWorkflowStep":
      return "workflow_step";
    case "executeTask":
      return "task";
    case "executeAgentAction":
      return "agent_action";
    default:
      return "task";
  }
}

function buildBaseEvent(
  executionId: string,
  method: string,
  request: ExecutionRequest,
): Omit<TelemetryEventData, "eventType" | "status" | "errorCode" | "errorMessage"> {
  return {
    tenantId: request.tenantContext.tenantId,
    moduleId: request.moduleExecutionContext.moduleId,
    executionType: resolveExecutionType(method),
    workflowId: (request.inputPayload.workflowId as string) ?? null,
    workflowStepId: (request.inputPayload.workflowStepId as string) ?? null,
    executionId,
    actorType: resolveActorType(request),
    actorId: resolveActorId(request),
    affectedRecordIds: (request.inputPayload.affectedRecordIds as string[]) ?? null,
  };
}

export async function emitExecutionStarted(
  executionId: string,
  method: string,
  request: ExecutionRequest,
): Promise<void> {
  try {
    await activeSink.emit({
      ...buildBaseEvent(executionId, method, request),
      eventType: "execution_started",
      status: "started",
    });
  } catch (err) {
    console.error(`[telemetry] Failed to emit execution_started: ${err instanceof Error ? err.message : err}`);
  }
}

export async function emitExecutionCompleted(
  executionId: string,
  method: string,
  request: ExecutionRequest,
  result: ExecutionResult,
): Promise<void> {
  try {
    await activeSink.emit({
      ...buildBaseEvent(executionId, method, request),
      eventType: "execution_completed",
      status: "completed",
      affectedRecordIds: (result.output.affectedRecordIds as string[]) ?? (request.inputPayload.affectedRecordIds as string[]) ?? null,
    });
  } catch (err) {
    console.error(`[telemetry] Failed to emit execution_completed: ${err instanceof Error ? err.message : err}`);
  }
}

export async function emitExecutionFailed(
  executionId: string,
  method: string,
  request: ExecutionRequest,
  errorCode: string | null,
  errorMessage: string,
): Promise<void> {
  try {
    await activeSink.emit({
      ...buildBaseEvent(executionId, method, request),
      eventType: "execution_failed",
      status: "failed",
      errorCode,
      errorMessage,
    });
  } catch (err) {
    console.error(`[telemetry] Failed to emit execution_failed: ${err instanceof Error ? err.message : err}`);
  }
}

export function generateExecutionId(): string {
  return randomUUID();
}
