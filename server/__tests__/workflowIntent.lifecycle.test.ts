import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetWorkflowExecutionIntent = vi.fn();
const mockClaimIntent = vi.fn();
const mockCompleteIntent = vi.fn();
const mockUpdateIntentFailed = vi.fn();
const mockGetWorkflowDefinition = vi.fn();
const mockGetWorkflowStepsByDefinition = vi.fn();
const mockGetChange = vi.fn();
const mockGetModule = vi.fn();
const mockGetProjects = vi.fn();
const mockGetModulesByProject = vi.fn();
const mockGetPendingIntents = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getWorkflowExecutionIntent: (...args: unknown[]) => mockGetWorkflowExecutionIntent(...args),
    claimIntent: (...args: unknown[]) => mockClaimIntent(...args),
    completeIntent: (...args: unknown[]) => mockCompleteIntent(...args),
    updateIntentFailed: (...args: unknown[]) => mockUpdateIntentFailed(...args),
    getWorkflowDefinition: (...args: unknown[]) => mockGetWorkflowDefinition(...args),
    getWorkflowStepsByDefinition: (...args: unknown[]) => mockGetWorkflowStepsByDefinition(...args),
    getChange: (...args: unknown[]) => mockGetChange(...args),
    getModule: (...args: unknown[]) => mockGetModule(...args),
    getProjects: (...args: unknown[]) => mockGetProjects(...args),
    getModulesByProject: (...args: unknown[]) => mockGetModulesByProject(...args),
    getPendingIntents: (...args: unknown[]) => mockGetPendingIntents(...args),
  },
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

const mockExecuteWorkflow = vi.fn();

vi.mock("../services/workflowEngine", () => ({
  executeWorkflow: (...args: unknown[]) => mockExecuteWorkflow(...args),
}));

vi.mock("../moduleContext", () => ({
  buildModuleExecutionContext: vi.fn(() => ({
    tenantId: "tenant-a",
    moduleId: "mod-1",
    moduleRootPath: "/modules/mod-1",
    capabilityProfile: "WORKFLOW_MODULE_DEFAULT",
  })),
}));

import { dispatchIntent, dispatchPendingIntents } from "../services/intentDispatcher";
import type { WorkflowExecutionIntent } from "@shared/schema";

const baseIntent: WorkflowExecutionIntent = {
  id: "intent-1",
  tenantId: "tenant-a",
  workflowDefinitionId: "wf-1",
  triggerType: "record_event",
  triggerPayload: { foo: "bar" },
  idempotencyKey: null,
  status: "pending",
  executionId: null,
  error: null,
  createdAt: new Date(),
  dispatchedAt: null,
};

describe("workflowIntent lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reloads intent from DB and skips if no longer pending", async () => {
    mockGetWorkflowExecutionIntent.mockResolvedValue({
      ...baseIntent,
      status: "running",
    });

    const result = await dispatchIntent(baseIntent);

    expect(result.status).toBe("running");
    expect(mockClaimIntent).not.toHaveBeenCalled();
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it("prevents double dispatch — second call is a no-op", async () => {
    // First call: intent is still pending, claim succeeds
    mockGetWorkflowExecutionIntent.mockResolvedValueOnce({ ...baseIntent, status: "pending" });
    mockClaimIntent.mockResolvedValueOnce({ ...baseIntent, status: "running" });
    mockGetWorkflowDefinition.mockResolvedValueOnce({
      id: "wf-1",
      tenantId: "tenant-a",
      status: "active",
      changeId: null,
    });
    mockGetWorkflowStepsByDefinition.mockResolvedValueOnce([{ id: "step-1" }]);
    mockGetProjects.mockResolvedValueOnce([{ id: "proj-1", tenantId: "tenant-a" }]);
    mockGetModulesByProject.mockResolvedValueOnce([{
      id: "mod-1",
      rootPath: "/modules/mod-1",
      capabilityProfile: "WORKFLOW_MODULE_DEFAULT",
    }]);
    mockExecuteWorkflow.mockResolvedValueOnce({ id: "exec-1" });
    mockCompleteIntent.mockResolvedValueOnce({ ...baseIntent, status: "completed", executionId: "exec-1" });

    const first = await dispatchIntent(baseIntent);
    expect(first.status).toBe("completed");
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);

    // Second call: intent is no longer pending (now completed in DB)
    mockGetWorkflowExecutionIntent.mockResolvedValueOnce({ ...baseIntent, status: "completed" });

    const second = await dispatchIntent(baseIntent);
    expect(second.status).toBe("completed");
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1); // not called again
  });

  it("atomically claims intent before executing workflow", async () => {
    mockGetWorkflowExecutionIntent.mockResolvedValue({ ...baseIntent, status: "pending" });
    // claimIntent returns undefined — another dispatcher claimed it
    mockClaimIntent.mockResolvedValue(undefined);

    const result = await dispatchIntent(baseIntent);

    expect(result.status).toBe("pending");
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it("transitions to failed on workflow execution error", async () => {
    mockGetWorkflowExecutionIntent.mockResolvedValue({ ...baseIntent, status: "pending" });
    mockClaimIntent.mockResolvedValue({ ...baseIntent, status: "running" });
    mockGetWorkflowDefinition.mockResolvedValue({
      id: "wf-1",
      tenantId: "tenant-a",
      status: "active",
      changeId: null,
    });
    mockGetWorkflowStepsByDefinition.mockResolvedValue([{ id: "step-1" }]);
    mockGetProjects.mockResolvedValue([{ id: "proj-1", tenantId: "tenant-a" }]);
    mockGetModulesByProject.mockResolvedValue([{
      id: "mod-1",
      rootPath: "/modules/mod-1",
      capabilityProfile: "WORKFLOW_MODULE_DEFAULT",
    }]);
    mockExecuteWorkflow.mockRejectedValue(new Error("Step execution failed"));
    mockUpdateIntentFailed.mockResolvedValue({ ...baseIntent, status: "failed", error: "Step execution failed" });

    const result = await dispatchIntent(baseIntent);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Step execution failed");
    expect(mockUpdateIntentFailed).toHaveBeenCalledWith("intent-1", "Step execution failed");
  });

  it("fails intent when workflow definition not found", async () => {
    mockGetWorkflowExecutionIntent.mockResolvedValue({ ...baseIntent, status: "pending" });
    mockClaimIntent.mockResolvedValue({ ...baseIntent, status: "running" });
    mockGetWorkflowDefinition.mockResolvedValue(undefined);
    mockUpdateIntentFailed.mockResolvedValue({ ...baseIntent, status: "failed", error: "Workflow definition not found" });

    const result = await dispatchIntent(baseIntent);

    expect(result.status).toBe("failed");
    expect(mockUpdateIntentFailed).toHaveBeenCalledWith("intent-1", "Workflow definition not found");
  });

  it("returns early when intent not found in DB", async () => {
    mockGetWorkflowExecutionIntent.mockResolvedValue(undefined);

    const result = await dispatchIntent(baseIntent);

    expect(result).toEqual(baseIntent);
    expect(mockClaimIntent).not.toHaveBeenCalled();
  });

  it("enforces tenant isolation — fails on tenant mismatch", async () => {
    mockGetWorkflowExecutionIntent.mockResolvedValue({ ...baseIntent, status: "pending" });
    mockClaimIntent.mockResolvedValue({ ...baseIntent, status: "running" });
    mockGetWorkflowDefinition.mockResolvedValue({
      id: "wf-1",
      tenantId: "tenant-OTHER",
      status: "active",
      changeId: null,
    });
    mockUpdateIntentFailed.mockResolvedValue({
      ...baseIntent,
      status: "failed",
      error: "Tenant mismatch between intent and workflow definition",
    });

    const result = await dispatchIntent(baseIntent);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Tenant mismatch between intent and workflow definition");
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });
});
