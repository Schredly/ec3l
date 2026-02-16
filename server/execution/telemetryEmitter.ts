import { randomUUID } from "crypto";
import type { ExecutionRequest, ExecutionResult } from "./types";
import type { InsertExecutionTelemetryEvent } from "@shared/schema";
import { storage } from "../storage";

type TelemetryExecutionType = "workflow_step" | "task" | "agent_action";

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

function resolveExecutionType(method: string): TelemetryExecutionType {
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
): Omit<InsertExecutionTelemetryEvent, "eventType" | "status" | "errorCode" | "errorMessage"> {
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
    await storage.createExecutionTelemetryEvent({
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
    await storage.createExecutionTelemetryEvent({
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
    await storage.createExecutionTelemetryEvent({
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
