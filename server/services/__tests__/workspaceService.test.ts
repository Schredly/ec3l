import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { Workspace, ChangeRecord } from "@shared/schema";
import type { ModuleExecutionContext } from "../../moduleContext";

const mockTenantStorage = {
  getWorkspaceByChange: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspaceStatus: vi.fn(),
  updateChangeStatus: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

const mockRunner = {
  executeAgentAction: vi.fn(),
};

vi.mock("../../execution", () => ({
  getRunnerExecution: () => mockRunner,
  buildExecutionRequest: vi.fn((opts: any) => opts),
}));

import { getWorkspaceByChange, startWorkspace, stopWorkspace } from "../workspaceService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

const fakeWorkspace: Workspace = {
  id: "ws-1",
  changeId: "change-1",
  status: "Running",
  containerId: "ctr-1",
  previewUrl: "http://preview",
  createdAt: new Date(),
};

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Fix bug",
  description: null,
  status: "Open",
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

describe("workspaceService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWorkspaceByChange", () => {
    it("delegates to ts.getWorkspaceByChange(changeId)", async () => {
      mockTenantStorage.getWorkspaceByChange.mockResolvedValue(fakeWorkspace);
      const result = await getWorkspaceByChange(ctx, "change-1");
      expect(mockTenantStorage.getWorkspaceByChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual(fakeWorkspace);
    });

    it("returns undefined when change not found", async () => {
      mockTenantStorage.getWorkspaceByChange.mockResolvedValue(undefined);
      const result = await getWorkspaceByChange(ctx, "no-change");
      expect(result).toBeUndefined();
    });
  });

  describe("startWorkspace", () => {
    it("creates workspace, runs agent, updates status, and returns workspace", async () => {
      mockTenantStorage.createWorkspace.mockResolvedValue(fakeWorkspace);
      mockRunner.executeAgentAction.mockResolvedValue({
        output: { containerId: "ctr-1", previewUrl: "http://preview" },
      });
      mockTenantStorage.updateWorkspaceStatus.mockResolvedValue(fakeWorkspace);
      mockTenantStorage.updateChangeStatus.mockResolvedValue({ ...fakeChange, status: "WorkspaceRunning" });
      mockTenantStorage.getWorkspaceByChange.mockResolvedValue(fakeWorkspace);

      const result = await startWorkspace(ctx, fakeChange, fakeModuleCtx);

      expect(mockTenantStorage.createWorkspace).toHaveBeenCalledWith({
        changeId: "change-1",
        containerId: null,
        previewUrl: null,
      });
      expect(mockTenantStorage.updateWorkspaceStatus).toHaveBeenCalledWith("ws-1", "Running", "ctr-1", "http://preview");
      expect(mockTenantStorage.updateChangeStatus).toHaveBeenCalledWith("change-1", "WorkspaceRunning", expect.any(String));
      expect(mockTenantStorage.getWorkspaceByChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual(fakeWorkspace);
    });
  });

  describe("stopWorkspace", () => {
    it("delegates to ts.updateWorkspaceStatus(id, 'Stopped')", async () => {
      mockTenantStorage.updateWorkspaceStatus.mockResolvedValue({ ...fakeWorkspace, status: "Stopped" });
      await stopWorkspace(ctx, "ws-1");
      expect(mockTenantStorage.updateWorkspaceStatus).toHaveBeenCalledWith("ws-1", "Stopped");
    });
  });
});
