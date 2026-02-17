import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { Project, RecordType } from "@shared/schema";

const mockTenantStorage = {
  getProject: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  createRecordType: vi.fn(),
  listRecordTypes: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  createRecordType,
  getRecordType,
  listRecordTypes,
  RecordTypeServiceError,
} from "../recordTypeService";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const fakeProject: Project = {
  id: "proj-1",
  tenantId: "tenant-a",
  name: "Test Project",
  description: null,
  repoUrl: null,
  createdAt: new Date(),
};

const fakeTask: RecordType = {
  id: "rt-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  name: "Task",
  key: "task",
  description: "A task",
  baseType: null,
  schema: { fields: [{ name: "title", type: "string" }] },
  version: 1,
  status: "active",
  createdAt: new Date(),
};

const fakeIncident: RecordType = {
  id: "rt-2",
  tenantId: "tenant-a",
  projectId: "proj-1",
  name: "Incident",
  key: "incident",
  description: "An incident",
  baseType: "task",
  schema: { fields: [{ name: "severity", type: "choice" }] },
  version: 1,
  status: "active",
  createdAt: new Date(),
};

describe("recordTypeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRecordType", () => {
    it("creates a record type", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);
      mockTenantStorage.createRecordType.mockResolvedValue(fakeTask);

      const result = await createRecordType(ctx, {
        projectId: "proj-1",
        key: "task",
        name: "Task",
        schema: { fields: [{ name: "title", type: "string" }] },
      });

      expect(result).toEqual(fakeTask);
      expect(mockTenantStorage.createRecordType).toHaveBeenCalledWith(
        expect.objectContaining({ key: "task", name: "Task", tenantId: "tenant-a" }),
      );
    });

    it("throws 404 when project not found", async () => {
      mockTenantStorage.getProject.mockResolvedValue(undefined);

      await expect(
        createRecordType(ctx, { projectId: "none", key: "task", name: "Task" }),
      ).rejects.toThrow("Project not found");
    });

    it("throws 409 when key already exists", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeTask);

      await expect(
        createRecordType(ctx, { projectId: "proj-1", key: "task", name: "Task" }),
      ).rejects.toThrow(/already exists/);
    });

    it("validates baseType exists", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(undefined) // key check
        .mockResolvedValueOnce(undefined); // baseType check

      await expect(
        createRecordType(ctx, {
          projectId: "proj-1",
          key: "incident",
          name: "Incident",
          baseType: "nonexistent",
        }),
      ).rejects.toThrow(/Base type "nonexistent" not found/);
    });

    it("allows baseType when it exists", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(undefined) // key check
        .mockResolvedValueOnce(fakeTask); // baseType check
      mockTenantStorage.createRecordType.mockResolvedValue(fakeIncident);

      const result = await createRecordType(ctx, {
        projectId: "proj-1",
        key: "incident",
        name: "Incident",
        baseType: "task",
      });

      expect(result.baseType).toBe("task");
    });

    it("rejects invalid schema shape", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);

      await expect(
        createRecordType(ctx, {
          projectId: "proj-1",
          key: "bad",
          name: "Bad",
          schema: { fields: [{ noName: true }] } as any,
        }),
      ).rejects.toThrow(/name/);
    });

    it("rejects non-object schema", async () => {
      mockTenantStorage.getProject.mockResolvedValue(fakeProject);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);

      await expect(
        createRecordType(ctx, {
          projectId: "proj-1",
          key: "bad",
          name: "Bad",
          schema: "not-an-object" as any,
        }),
      ).rejects.toThrow("schema must be a JSON object");
    });

    it("rejects empty key", async () => {
      await expect(
        createRecordType(ctx, { projectId: "proj-1", key: "", name: "Task" }),
      ).rejects.toThrow("key is required");
    });

    it("rejects empty name", async () => {
      await expect(
        createRecordType(ctx, { projectId: "proj-1", key: "task", name: "" }),
      ).rejects.toThrow("name is required");
    });
  });

  describe("getRecordType", () => {
    it("returns record type by key", async () => {
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeTask);

      const result = await getRecordType(ctx, "task");
      expect(mockTenantStorage.getRecordTypeByKey).toHaveBeenCalledWith("task");
      expect(result).toEqual(fakeTask);
    });

    it("returns undefined for non-existent key", async () => {
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);

      const result = await getRecordType(ctx, "none");
      expect(result).toBeUndefined();
    });
  });

  describe("listRecordTypes", () => {
    it("returns all record types for tenant", async () => {
      mockTenantStorage.listRecordTypes.mockResolvedValue([fakeTask, fakeIncident]);

      const result = await listRecordTypes(ctx);
      expect(result).toHaveLength(2);
    });
  });
});
