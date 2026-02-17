import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { AgentRun, ChangeRecord } from "@shared/schema";
import type { ModuleExecutionContext } from "../../moduleContext";

const mockTenantStorage = {
  getAgentRuns: vi.fn(),
  getAgentRunsByChange: vi.fn(),
  createAgentRun: vi.fn(),
  updateAgentRun: vi.fn(),
  updateChangeStatus: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

const mockRunner = {
  executeTask: vi.fn(),
  executeAgentAction: vi.fn(),
};

vi.mock("../../execution", () => ({
  getRunnerExecution: () => mockRunner,
  buildExecutionRequest: vi.fn((opts: any) => opts),
}));

const mockSkillRegistry = {
  invoke: vi.fn(),
};

vi.mock("../../skills/registry", () => ({
  skillRegistry: {
    invoke: (...args: any[]) => mockSkillRegistry.invoke(...args),
  },
}));

import { getAgentRuns, getAgentRunsByChange, createAgentRun } from "../agentRunService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

const fakeRun: AgentRun = {
  id: "run-1",
  changeId: "change-1",
  intent: "Fix bug",
  status: "Running",
  skillsUsed: null,
  logs: null,
  createdAt: new Date(),
};

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Fix bug",
  description: null,
  status: "WorkspaceRunning",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const fakeModuleCtx: ModuleExecutionContext = {
  tenantContext: makeTenantContext(),
  moduleId: "mod-1",
  moduleRootPath: "src/core",
  capabilityProfile: "CODE_MODULE_DEFAULT",
  capabilities: ["file:read", "file:write"],
};

describe("agentRunService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAgentRuns", () => {
    it("delegates to ts.getAgentRuns()", async () => {
      mockTenantStorage.getAgentRuns.mockResolvedValue([fakeRun]);
      const result = await getAgentRuns(ctx);
      expect(mockTenantStorage.getAgentRuns).toHaveBeenCalledOnce();
      expect(result).toEqual([fakeRun]);
    });
  });

  describe("getAgentRunsByChange", () => {
    it("delegates to ts.getAgentRunsByChange(changeId)", async () => {
      mockTenantStorage.getAgentRunsByChange.mockResolvedValue([fakeRun]);
      const result = await getAgentRunsByChange(ctx, "change-1");
      expect(mockTenantStorage.getAgentRunsByChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual([fakeRun]);
    });
  });

  describe("createAgentRun", () => {
    it("creates run and executes skills on success path", async () => {
      mockTenantStorage.createAgentRun.mockResolvedValue(fakeRun);
      mockRunner.executeTask.mockResolvedValue({ success: true, logs: ["ok"] });
      mockSkillRegistry.invoke.mockResolvedValue({ success: true, logs: ["done"] });
      const passedRun = { ...fakeRun, status: "Passed" as const };
      mockTenantStorage.updateAgentRun.mockResolvedValue(passedRun);
      mockTenantStorage.updateChangeStatus.mockResolvedValue({ ...fakeChange, status: "Ready" });

      const result = await createAgentRun(ctx, { changeId: "change-1", intent: "Fix bug" }, fakeChange, fakeModuleCtx);

      expect(mockTenantStorage.createAgentRun).toHaveBeenCalledOnce();
      expect(mockTenantStorage.updateAgentRun).toHaveBeenCalled();
      expect(mockTenantStorage.updateChangeStatus).toHaveBeenCalledWith("change-1", "Ready");
      expect(result.status).toBe("Passed");
    });

    it("marks run as Failed on boundary check failure", async () => {
      mockTenantStorage.createAgentRun.mockResolvedValue(fakeRun);
      mockRunner.executeTask.mockResolvedValue({ success: false, logs: ["boundary fail"], error: "out of bounds" });
      const failedRun = { ...fakeRun, status: "Failed" as const };
      mockTenantStorage.updateAgentRun.mockResolvedValue(failedRun);
      mockTenantStorage.updateChangeStatus.mockResolvedValue({ ...fakeChange, status: "ValidationFailed" });

      const result = await createAgentRun(ctx, { changeId: "change-1", intent: "Fix bug" }, fakeChange, fakeModuleCtx);

      expect(result.status).toBe("Failed");
      expect(mockTenantStorage.updateChangeStatus).toHaveBeenCalledWith("change-1", "ValidationFailed");
    });
  });
});
