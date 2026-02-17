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
  type: "module",
  selector: { moduleId: "mod-1" },
  createdAt: new Date(),
};

describe("changeTargetService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createChangeTarget", () => {
    it("creates a target for an existing change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.createChangeTarget.mockResolvedValue(fakeTarget);

      const result = await createChangeTarget(ctx, "change-1", {
        type: "module",
        selector: { moduleId: "mod-1" },
      });

      expect(mockTenantStorage.getChange).toHaveBeenCalledWith("change-1");
      expect(mockTenantStorage.getProject).toHaveBeenCalledWith("proj-1");
      expect(mockTenantStorage.createChangeTarget).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        projectId: "proj-1",
        changeId: "change-1",
        type: "module",
        selector: { moduleId: "mod-1" },
      });
      expect(result).toEqual(fakeTarget);
    });

    it("throws 404 when change not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);

      await expect(
        createChangeTarget(ctx, "no-change", {
          type: "module",
          selector: { moduleId: "mod-1" },
        }),
      ).rejects.toThrow(ChangeTargetServiceError);

      await expect(
        createChangeTarget(ctx, "no-change", {
          type: "module",
          selector: { moduleId: "mod-1" },
        }),
      ).rejects.toThrow("Change not found");
    });

    it("throws 404 when project not found for change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getProject.mockResolvedValue(undefined);

      await expect(
        createChangeTarget(ctx, "change-1", {
          type: "module",
          selector: { moduleId: "mod-1" },
        }),
      ).rejects.toThrow("Project not found for this change");
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
