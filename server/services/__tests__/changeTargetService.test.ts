import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { ChangeRecord, Project, ChangeTarget } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  getProject: vi.fn(),
  createChangeTarget: vi.fn(),
  getChangeTargetsByChange: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  createChangeTarget,
  listChangeTargets,
  ChangeTargetServiceError,
} from "../changeTargetService";

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
  status: "Draft",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const fakeTarget: ChangeTarget = {
  id: "ct-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "form",
  selector: { formId: "form-1" },
  createdAt: new Date(),
};

describe("changeTargetService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createChangeTarget", () => {
    it("creates a target for an existing draft change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.createChangeTarget.mockResolvedValue(fakeTarget);

      const result = await createChangeTarget(ctx, "change-1", {
        type: "form",
        selector: { formId: "form-1" },
      });

      expect(mockTenantStorage.getChange).toHaveBeenCalledWith("change-1");
      expect(mockTenantStorage.getProject).toHaveBeenCalledWith("proj-1");
      expect(mockTenantStorage.createChangeTarget).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        projectId: "proj-1",
        changeId: "change-1",
        type: "form",
        selector: { formId: "form-1" },
      });
      expect(result).toEqual(fakeTarget);
    });

    it("throws 404 when change not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);

      await expect(
        createChangeTarget(ctx, "no-change", {
          type: "form",
          selector: { formId: "form-1" },
        }),
      ).rejects.toThrow("Change not found");
    });

    it("throws 404 when project not found for change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getProject.mockResolvedValue(undefined);

      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "form",
          selector: { formId: "form-1" },
        }),
      ).rejects.toThrow("Project not found for this change");
    });

    it("rejects target creation when change is not in Draft status", async () => {
      mockTenantStorage.getChange.mockResolvedValue({ ...fakeChange, status: "Merged" });

      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "form",
          selector: { formId: "form-1" },
        }),
      ).rejects.toThrow(/must be "Draft"/);
    });

    it("rejects invalid target type", async () => {
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "invalid" as any,
          selector: {},
        }),
      ).rejects.toThrow(/Invalid target type/);
    });

    it("validates selector shape for each type", async () => {
      // form requires formId
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "form",
          selector: {},
        }),
      ).rejects.toThrow(/formId/);

      // workflow requires workflowDefinitionId
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "workflow",
          selector: {},
        }),
      ).rejects.toThrow(/workflowDefinitionId/);

      // rule requires ruleId
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "rule",
          selector: {},
        }),
      ).rejects.toThrow(/ruleId/);

      // record_type requires recordTypeId
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "record_type",
          selector: {},
        }),
      ).rejects.toThrow(/recordTypeId/);

      // script requires scriptPath
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "script",
          selector: {},
        }),
      ).rejects.toThrow(/scriptPath/);

      // file requires filePath
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "file",
          selector: {},
        }),
      ).rejects.toThrow(/filePath/);
    });

    it("rejects non-object selector", async () => {
      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "form",
          selector: "not-an-object" as any,
        }),
      ).rejects.toThrow("selector must be a JSON object");
    });
  });

  describe("listChangeTargets", () => {
    it("returns targets for a change", async () => {
      mockTenantStorage.getChangeTargetsByChange.mockResolvedValue([fakeTarget]);

      const result = await listChangeTargets(ctx, "change-1");
      expect(mockTenantStorage.getChangeTargetsByChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual([fakeTarget]);
    });

    it("returns empty array for non-existent change", async () => {
      mockTenantStorage.getChangeTargetsByChange.mockResolvedValue([]);

      const result = await listChangeTargets(ctx, "no-change");
      expect(result).toEqual([]);
    });
  });
});
