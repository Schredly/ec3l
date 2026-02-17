import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { Project, Module, Environment } from "@shared/schema";

const mockTenantStorage = {
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  createModule: vi.fn(),
  createEnvironment: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { getProjects, getProject, createProject } from "../projectService";

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

const fakeModule: Module = {
  id: "mod-1",
  projectId: "proj-1",
  name: "default",
  type: "code",
  rootPath: "src",
  version: "1.0.0",
  capabilityProfile: "CODE_MODULE_DEFAULT",
  createdAt: new Date(),
};

const fakeEnvironment: Environment = {
  id: "env-1",
  projectId: "proj-1",
  name: "dev",
  isDefault: true,
  createdAt: new Date(),
};

describe("projectService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProjects", () => {
    it("delegates to ts.getProjects()", async () => {
      mockTenantStorage.getProjects.mockResolvedValue([fakeProject]);
      const result = await getProjects(ctx);
      expect(mockTenantStorage.getProjects).toHaveBeenCalledOnce();
      expect(result).toEqual([fakeProject]);
    });
  });

  describe("getProject", () => {
    it("delegates to ts.getProject(id)", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      const result = await getProject(ctx, "proj-1");
      expect(mockTenantStorage.getProject).toHaveBeenCalledWith("proj-1");
      expect(result).toEqual(fakeProject);
    });

    it("returns undefined for non-existent project", async () => {
      mockTenantStorage.getProject.mockResolvedValue(undefined);
      const result = await getProject(ctx, "no-proj");
      expect(result).toBeUndefined();
    });
  });

  describe("createProject", () => {
    it("creates project with default module and 3 environments", async () => {
      mockTenantStorage.createProject.mockResolvedValue(fakeProject);
      mockTenantStorage.createModule.mockResolvedValue(fakeModule);
      mockTenantStorage.createEnvironment.mockResolvedValue(fakeEnvironment);

      const result = await createProject(ctx, { name: "Test Project" });

      expect(mockTenantStorage.createProject).toHaveBeenCalledOnce();
      expect(mockTenantStorage.createModule).toHaveBeenCalledWith({
        projectId: "proj-1",
        name: "default",
        type: "code",
        rootPath: "src",
      });
      expect(mockTenantStorage.createEnvironment).toHaveBeenCalledTimes(3);
      expect(mockTenantStorage.createEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", name: "dev", isDefault: true }),
      );
      expect(mockTenantStorage.createEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", name: "test", isDefault: false }),
      );
      expect(mockTenantStorage.createEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", name: "prod", isDefault: false }),
      );
      expect(result).toEqual(fakeProject);
    });
  });
});
