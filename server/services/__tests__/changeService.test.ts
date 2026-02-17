import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { ChangeRecord, Project, Module, Environment } from "@shared/schema";

const mockTenantStorage = {
  getChanges: vi.fn(),
  getChange: vi.fn(),
  updateChangeStatus: vi.fn(),
  createChange: vi.fn(),
  getProject: vi.fn(),
  getProjects: vi.fn(),
  createProject: vi.fn(),
  getModule: vi.fn(),
  getModuleByProjectAndPath: vi.fn(),
  createModule: vi.fn(),
  getDefaultEnvironment: vi.fn(),
  getChangesByProject: vi.fn(),
  getModules: vi.fn(),
  getModulesByProject: vi.fn(),
  getEnvironmentsByProject: vi.fn(),
  getEnvironment: vi.fn(),
  createEnvironment: vi.fn(),
  getAgentRuns: vi.fn(),
  getAgentRunsByChange: vi.fn(),
  createAgentRun: vi.fn(),
  updateAgentRun: vi.fn(),
  getWorkspaceByChange: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspaceStatus: vi.fn(),
  // Agent Proposals
  createAgentProposal: vi.fn(),
  getAgentProposal: vi.fn(),
  getAgentProposalsByChange: vi.fn(),
  getAgentProposalsByTenant: vi.fn(),
  updateAgentProposalStatus: vi.fn(),
  // Workflow Definitions
  createWorkflowDefinition: vi.fn(),
  getWorkflowDefinition: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  updateWorkflowDefinitionStatus: vi.fn(),
  updateWorkflowDefinitionChangeId: vi.fn(),
  // Workflow Steps
  createWorkflowStep: vi.fn(),
  getWorkflowStepsByDefinition: vi.fn(),
  // Workflow Executions
  getWorkflowExecution: vi.fn(),
  getWorkflowExecutionsByTenant: vi.fn(),
  getWorkflowStepExecutionsByExecution: vi.fn(),
  // Workflow Execution Intents
  createWorkflowExecutionIntent: vi.fn(),
  // Workflow Triggers
  createWorkflowTrigger: vi.fn(),
  getWorkflowTrigger: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  getWorkflowTriggersByDefinition: vi.fn(),
  updateWorkflowTriggerStatus: vi.fn(),
  getActiveTriggersByTenantAndType: vi.fn(),
  // Change Targets
  createChangeTarget: vi.fn(),
  getChangeTargetsByChange: vi.fn(),
  getChangeTarget: vi.fn(),
  // Change Patch Ops
  createChangePatchOp: vi.fn(),
  getChangePatchOpsByChange: vi.fn(),
  // Record Types
  createRecordType: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  listRecordTypes: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  getChanges,
  getChange,
  updateChangeStatus,
  createChange,
  ChangeServiceError,
} from "../changeService";

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

const fakeModule: Module = {
  id: "mod-1",
  projectId: "proj-1",
  name: "core",
  type: "code",
  rootPath: "src/core",
  version: "1.0.0",
  capabilityProfile: "CODE_MODULE_DEFAULT",
  createdAt: new Date(),
};

describe("changeService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getChanges", () => {
    it("delegates to ts.getChanges()", async () => {
      mockTenantStorage.getChanges.mockResolvedValue([fakeChange]);
      const result = await getChanges(ctx);
      expect(mockTenantStorage.getChanges).toHaveBeenCalledOnce();
      expect(result).toEqual([fakeChange]);
    });
  });

  describe("getChange", () => {
    it("delegates to ts.getChange(id)", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      const result = await getChange(ctx, "change-1");
      expect(mockTenantStorage.getChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual(fakeChange);
    });

    it("returns undefined for non-existent change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);
      const result = await getChange(ctx, "no-such-id");
      expect(result).toBeUndefined();
    });
  });

  describe("updateChangeStatus", () => {
    it("delegates to ts.updateChangeStatus()", async () => {
      const updated = { ...fakeChange, status: "InProgress" as const };
      mockTenantStorage.updateChangeStatus.mockResolvedValue(updated);
      const result = await updateChangeStatus(ctx, "change-1", "InProgress");
      expect(mockTenantStorage.updateChangeStatus).toHaveBeenCalledWith("change-1", "InProgress", undefined);
      expect(result).toEqual(updated);
    });

    it("passes branchName when provided", async () => {
      const updated = { ...fakeChange, status: "InProgress" as const, branchName: "feat/x" };
      mockTenantStorage.updateChangeStatus.mockResolvedValue(updated);
      const result = await updateChangeStatus(ctx, "change-1", "InProgress", "feat/x");
      expect(mockTenantStorage.updateChangeStatus).toHaveBeenCalledWith("change-1", "InProgress", "feat/x");
      expect(result).toEqual(updated);
    });
  });

  describe("createChange", () => {
    it("calls ts.getProject() for validation and ts.createChange()", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.createChange.mockResolvedValue(fakeChange);

      const result = await createChange(ctx, {
        projectId: "proj-1",
        title: "Fix bug",
      });

      expect(mockTenantStorage.getProject).toHaveBeenCalledWith("proj-1");
      expect(mockTenantStorage.createChange).toHaveBeenCalledOnce();
      expect(result).toEqual(fakeChange);
    });

    it("throws 404 when project not found", async () => {
      mockTenantStorage.getProject.mockResolvedValue(undefined);

      await expect(
        createChange(ctx, { projectId: "bad-proj", title: "X" }),
      ).rejects.toThrow(ChangeServiceError);

      await expect(
        createChange(ctx, { projectId: "bad-proj", title: "X" }),
      ).rejects.toThrow("Project not found");
    });

    it("resolves module by moduleId", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getModule.mockResolvedValue(fakeModule);
      mockTenantStorage.createChange.mockResolvedValue({
        ...fakeChange,
        moduleId: "mod-1",
        modulePath: "src/core",
      });

      await createChange(ctx, {
        projectId: "proj-1",
        title: "With module",
        moduleId: "mod-1",
      });

      expect(mockTenantStorage.getModule).toHaveBeenCalledWith("mod-1");
      expect(mockTenantStorage.createChange).toHaveBeenCalledWith(
        expect.objectContaining({ modulePath: "src/core" }),
      );
    });

    it("throws 400 when moduleId not found", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getModule.mockResolvedValue(undefined);

      await expect(
        createChange(ctx, {
          projectId: "proj-1",
          title: "Bad module",
          moduleId: "no-mod",
        }),
      ).rejects.toThrow("Module not found");
    });

    it("auto-creates module when modulePath given but no moduleId", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getModuleByProjectAndPath.mockResolvedValue(undefined);
      mockTenantStorage.createModule.mockResolvedValue(fakeModule);
      mockTenantStorage.createChange.mockResolvedValue(fakeChange);

      await createChange(ctx, {
        projectId: "proj-1",
        title: "Auto module",
        modulePath: "src/core",
      });

      expect(mockTenantStorage.getModuleByProjectAndPath).toHaveBeenCalledWith("proj-1", "src/core");
      expect(mockTenantStorage.createModule).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "proj-1",
          name: "core",
          type: "code",
          rootPath: "src/core",
        }),
      );
    });

    it("resolves default environment when not provided", async () => {
      const fakeEnv = { id: "env-1", projectId: "proj-1", name: "dev", isDefault: true } as Environment;
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getDefaultEnvironment.mockResolvedValue(fakeEnv);
      mockTenantStorage.createChange.mockResolvedValue(fakeChange);

      await createChange(ctx, {
        projectId: "proj-1",
        title: "With env",
      });

      expect(mockTenantStorage.getDefaultEnvironment).toHaveBeenCalledWith("proj-1");
      expect(mockTenantStorage.createChange).toHaveBeenCalledWith(
        expect.objectContaining({ environmentId: "env-1" }),
      );
    });
  });
});
