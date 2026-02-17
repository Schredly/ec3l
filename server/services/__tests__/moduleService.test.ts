import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { Module } from "@shared/schema";

const mockTenantStorage = {
  getModules: vi.fn(),
  getModulesByProject: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { getModules, getModulesByProject } from "../moduleService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

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

describe("moduleService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getModules", () => {
    it("delegates to ts.getModules()", async () => {
      mockTenantStorage.getModules.mockResolvedValue([fakeModule]);
      const result = await getModules(ctx);
      expect(mockTenantStorage.getModules).toHaveBeenCalledOnce();
      expect(result).toEqual([fakeModule]);
    });

    it("returns empty array when no modules", async () => {
      mockTenantStorage.getModules.mockResolvedValue([]);
      const result = await getModules(ctx);
      expect(result).toEqual([]);
    });
  });

  describe("getModulesByProject", () => {
    it("delegates to ts.getModulesByProject(projectId)", async () => {
      mockTenantStorage.getModulesByProject.mockResolvedValue([fakeModule]);
      const result = await getModulesByProject(ctx, "proj-1");
      expect(mockTenantStorage.getModulesByProject).toHaveBeenCalledWith("proj-1");
      expect(result).toEqual([fakeModule]);
    });

    it("returns empty array for non-existent project", async () => {
      mockTenantStorage.getModulesByProject.mockResolvedValue([]);
      const result = await getModulesByProject(ctx, "no-project");
      expect(result).toEqual([]);
    });
  });
});
