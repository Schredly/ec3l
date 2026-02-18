import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { Project, RecordType } from "@shared/schema";

const mockTenantStorage = {
  getProject: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  createRecordType: vi.fn(),
  updateRecordType: vi.fn(),
  listRecordTypes: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  createRecordType,
  updateRecordType,
  RecordTypeServiceError,
} from "../services/recordTypeService";

// --- Fixtures ---

const tenantA: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const projectA: Project = {
  id: "proj-a",
  tenantId: "tenant-a",
  name: "Project A",
  description: null,
  repoUrl: null,
  createdAt: new Date(),
};

const projectB: Project = {
  id: "proj-b",
  tenantId: "tenant-a",
  name: "Project B",
  description: null,
  repoUrl: null,
  createdAt: new Date(),
};

const taskInProjectA: RecordType = {
  id: "rt-task-a",
  tenantId: "tenant-a",
  projectId: "proj-a",
  key: "task",
  name: "Task",
  description: null,
  baseType: null,
  schema: { fields: [{ name: "title", type: "string", required: true }] },
  version: 1,
  status: "active",
  createdAt: new Date(),
};

// Defense-in-depth fixture: a record type that appears to belong to the right
// project but carries a foreign tenantId. In production this cannot happen
// because storage is tenant-scoped, but the guard must still catch it.
const taskCrossTenant: RecordType = {
  id: "rt-task-cross",
  tenantId: "tenant-b",
  projectId: "proj-a",
  key: "task",
  name: "Task",
  description: null,
  baseType: null,
  schema: { fields: [{ name: "title", type: "string" }] },
  version: 1,
  status: "active",
  createdAt: new Date(),
};

describe("recordType baseType isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createRecordType ──────────────────────────────────────────────

  describe("createRecordType", () => {
    it("rejects baseType from a different project (same tenant)", async () => {
      // Project B exists; task lives in Project A
      mockTenantStorage.getProject.mockResolvedValue(projectB);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(undefined)      // key uniqueness — "incident" is new
        .mockResolvedValueOnce(taskInProjectA); // baseType lookup — task is in proj-a

      await expect(
        createRecordType(tenantA, {
          projectId: "proj-b",
          key: "incident",
          name: "Incident",
          baseType: "task",
        }),
      ).rejects.toThrow("Base type must belong to same project");
    });

    it("rejects baseType from a different tenant (defense-in-depth)", async () => {
      mockTenantStorage.getProject.mockResolvedValue(projectA);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(undefined)     // key uniqueness
        .mockResolvedValueOnce(taskCrossTenant); // baseType lookup — wrong tenantId

      await expect(
        createRecordType(tenantA, {
          projectId: "proj-a",
          key: "incident",
          name: "Incident",
          baseType: "task",
        }),
      ).rejects.toThrow("Cross-tenant base type not allowed");
    });

    it("allows baseType from the same project and tenant", async () => {
      mockTenantStorage.getProject.mockResolvedValue(projectA);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(undefined)      // key uniqueness
        .mockResolvedValueOnce(taskInProjectA); // baseType lookup — same project & tenant

      const expectedIncident: RecordType = {
        id: "rt-incident",
        tenantId: "tenant-a",
        projectId: "proj-a",
        key: "incident",
        name: "Incident",
        description: null,
        baseType: "task",
        schema: { fields: [] },
        version: 1,
        status: "draft",
        createdAt: new Date(),
      };
      mockTenantStorage.createRecordType.mockResolvedValue(expectedIncident);

      const result = await createRecordType(tenantA, {
        projectId: "proj-a",
        key: "incident",
        name: "Incident",
        baseType: "task",
      });

      expect(result.baseType).toBe("task");
      expect(mockTenantStorage.createRecordType).toHaveBeenCalledOnce();
    });
  });

  // ── updateRecordType ──────────────────────────────────────────────

  describe("updateRecordType", () => {
    it("rejects baseType from a different project (same tenant)", async () => {
      const incidentInProjectB: RecordType = {
        id: "rt-incident-b",
        tenantId: "tenant-a",
        projectId: "proj-b",
        key: "incident",
        name: "Incident",
        description: null,
        baseType: null,
        schema: { fields: [] },
        version: 1,
        status: "active",
        createdAt: new Date(),
      };

      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incidentInProjectB) // existing record type (proj-b)
        .mockResolvedValueOnce(taskInProjectA);    // baseType lookup (proj-a) — mismatch

      await expect(
        updateRecordType(tenantA, "incident", { baseType: "task" }),
      ).rejects.toThrow("Base type must belong to same project");
    });

    it("rejects baseType from a different tenant (defense-in-depth)", async () => {
      const incidentInProjectA: RecordType = {
        id: "rt-incident-a",
        tenantId: "tenant-a",
        projectId: "proj-a",
        key: "incident",
        name: "Incident",
        description: null,
        baseType: null,
        schema: { fields: [] },
        version: 1,
        status: "active",
        createdAt: new Date(),
      };

      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incidentInProjectA) // existing record type
        .mockResolvedValueOnce(taskCrossTenant);   // baseType — wrong tenantId

      await expect(
        updateRecordType(tenantA, "incident", { baseType: "task" }),
      ).rejects.toThrow("Cross-tenant base type not allowed");
    });

    it("allows baseType from the same project and tenant", async () => {
      const incidentInProjectA: RecordType = {
        id: "rt-incident-a",
        tenantId: "tenant-a",
        projectId: "proj-a",
        key: "incident",
        name: "Incident",
        description: null,
        baseType: null,
        schema: { fields: [] },
        version: 1,
        status: "active",
        createdAt: new Date(),
      };

      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incidentInProjectA) // existing record type
        .mockResolvedValueOnce(taskInProjectA);    // baseType — same project & tenant

      const updatedIncident = { ...incidentInProjectA, baseType: "task" };
      mockTenantStorage.updateRecordType.mockResolvedValue(updatedIncident);

      const result = await updateRecordType(tenantA, "incident", { baseType: "task" });

      expect(result.baseType).toBe("task");
      expect(mockTenantStorage.updateRecordType).toHaveBeenCalledOnce();
    });
  });
});
