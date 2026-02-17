import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { Environment } from "@shared/schema";

const mockTenantStorage = {
  getEnvironmentsByProject: vi.fn(),
  getEnvironment: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { getEnvironmentsByProject, getEnvironment } from "../environmentService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

const fakeEnvironment: Environment = {
  id: "env-1",
  projectId: "proj-1",
  name: "dev",
  isDefault: true,
  createdAt: new Date(),
};

describe("environmentService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEnvironmentsByProject", () => {
    it("delegates to ts.getEnvironmentsByProject(projectId)", async () => {
      mockTenantStorage.getEnvironmentsByProject.mockResolvedValue([fakeEnvironment]);
      const result = await getEnvironmentsByProject(ctx, "proj-1");
      expect(mockTenantStorage.getEnvironmentsByProject).toHaveBeenCalledWith("proj-1");
      expect(result).toEqual([fakeEnvironment]);
    });

    it("returns empty array for non-existent project", async () => {
      mockTenantStorage.getEnvironmentsByProject.mockResolvedValue([]);
      const result = await getEnvironmentsByProject(ctx, "no-project");
      expect(result).toEqual([]);
    });
  });

  describe("getEnvironment", () => {
    it("delegates to ts.getEnvironment(id)", async () => {
      mockTenantStorage.getEnvironment.mockResolvedValue(fakeEnvironment);
      const result = await getEnvironment(ctx, "env-1");
      expect(mockTenantStorage.getEnvironment).toHaveBeenCalledWith("env-1");
      expect(result).toEqual(fakeEnvironment);
    });

    it("returns undefined for non-existent environment", async () => {
      mockTenantStorage.getEnvironment.mockResolvedValue(undefined);
      const result = await getEnvironment(ctx, "no-env");
      expect(result).toBeUndefined();
    });
  });
});
