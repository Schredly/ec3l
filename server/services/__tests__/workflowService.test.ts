import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { WorkflowDefinition, WorkflowStep, WorkflowExecution, Project } from "@shared/schema";

const mockTenantStorage = {
  getProject: vi.fn(),
  getModule: vi.fn(),
  createChange: vi.fn(),
  getChange: vi.fn(),
  createWorkflowDefinition: vi.fn(),
  getWorkflowDefinition: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  updateWorkflowDefinitionStatus: vi.fn(),
  updateWorkflowDefinitionChangeId: vi.fn(),
  createWorkflowStep: vi.fn(),
  getWorkflowStepsByDefinition: vi.fn(),
  getWorkflowExecution: vi.fn(),
  getWorkflowExecutionsByTenant: vi.fn(),
  getWorkflowStepExecutionsByExecution: vi.fn(),
  createWorkflowExecutionIntent: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../../storage", () => ({
  storage: {
    getWorkflowDefinitionsByTenant: vi.fn(),
    getWorkflowExecution: vi.fn(),
  },
}));

vi.mock("../workflowEngine", () => ({
  validateDecisionSteps: vi.fn().mockReturnValue([]),
  WorkflowExecutionError: class extends Error {
    statusCode: number;
    constructor(msg: string, code = 400) { super(msg); this.statusCode = code; }
  },
  resumeWorkflowExecution: vi.fn(),
}));

vi.mock("../intentDispatcher", () => ({
  dispatchIntent: vi.fn(),
}));

import {
  createWorkflowDefinition,
  getWorkflowDefinitions,
  getWorkflowDefinition,
  activateWorkflowDefinition,
  retireWorkflowDefinition,
  getWorkflowExecution,
  WorkflowServiceError,
} from "../workflowService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

const fakeProject: Project = {
  id: "proj-1",
  tenantId: "tenant-a",
  name: "Test Project",
  description: null,
  repoUrl: null,
  createdAt: new Date(),
};

const fakeWf: WorkflowDefinition = {
  id: "wf-1",
  tenantId: "tenant-a",
  name: "Deploy",
  triggerType: "manual",
  triggerConfig: null,
  version: 1,
  status: "draft",
  changeId: "change-1",
  createdAt: new Date(),
};

const fakeStep: WorkflowStep = {
  id: "step-1",
  workflowDefinitionId: "wf-1",
  stepType: "skill_invocation",
  config: { skill: "build" },
  orderIndex: 0,
};

describe("workflowService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createWorkflowDefinition", () => {
    it("creates a definition with a linked change", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.createChange.mockResolvedValue({ id: "change-1" });
      mockTenantStorage.createWorkflowDefinition.mockResolvedValue(fakeWf);
      mockTenantStorage.updateWorkflowDefinitionChangeId.mockResolvedValue(fakeWf);
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(fakeWf);

      const result = await createWorkflowDefinition(
        ctx,
        { name: "Deploy", triggerType: "manual" },
        "proj-1",
      );

      expect(mockTenantStorage.getProject).toHaveBeenCalledWith("proj-1");
      expect(mockTenantStorage.createChange).toHaveBeenCalledOnce();
      expect(mockTenantStorage.createWorkflowDefinition).toHaveBeenCalledOnce();
      expect(result).toEqual(fakeWf);
    });

    it("throws 404 when project not found", async () => {
      mockTenantStorage.getProject.mockResolvedValue(undefined);

      await expect(
        createWorkflowDefinition(ctx, { name: "X", triggerType: "manual" }, "bad-proj"),
      ).rejects.toThrow(WorkflowServiceError);
    });
  });

  describe("getWorkflowDefinitions", () => {
    it("delegates to ts.getWorkflowDefinitionsByTenant", async () => {
      mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([fakeWf]);
      const result = await getWorkflowDefinitions(ctx);
      expect(mockTenantStorage.getWorkflowDefinitionsByTenant).toHaveBeenCalledOnce();
      expect(result).toEqual([fakeWf]);
    });
  });

  describe("getWorkflowDefinition", () => {
    it("returns undefined for missing definition", async () => {
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(undefined);
      const result = await getWorkflowDefinition(ctx, "no-id");
      expect(result).toBeUndefined();
    });
  });

  describe("activateWorkflowDefinition", () => {
    it("throws when no steps exist", async () => {
      const readyChange = { id: "change-1", status: "Ready" };
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(fakeWf);
      mockTenantStorage.getChange.mockResolvedValue(readyChange);
      mockTenantStorage.getWorkflowStepsByDefinition.mockResolvedValue([]);

      await expect(activateWorkflowDefinition(ctx, "wf-1")).rejects.toThrow(
        "Cannot activate workflow with no steps",
      );
    });

    it("activates a valid draft workflow", async () => {
      const readyChange = { id: "change-1", status: "Ready" };
      const activeWf = { ...fakeWf, status: "active" as const };
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(fakeWf);
      mockTenantStorage.getChange.mockResolvedValue(readyChange);
      mockTenantStorage.getWorkflowStepsByDefinition.mockResolvedValue([fakeStep]);
      mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue(activeWf);

      const result = await activateWorkflowDefinition(ctx, "wf-1");
      expect(result.status).toBe("active");
    });
  });

  describe("retireWorkflowDefinition", () => {
    it("throws when not found", async () => {
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(undefined);
      await expect(retireWorkflowDefinition(ctx, "no-id")).rejects.toThrow(WorkflowServiceError);
    });
  });

  describe("getWorkflowExecution", () => {
    it("returns undefined for missing execution", async () => {
      mockTenantStorage.getWorkflowExecution.mockResolvedValue(undefined);
      const result = await getWorkflowExecution(ctx, "no-id");
      expect(result).toBeUndefined();
    });
  });
});
