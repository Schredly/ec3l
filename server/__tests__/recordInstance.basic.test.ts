import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

const mockGetRecordType = vi.fn();
const mockCreateRecordInstance = vi.fn();
const mockGetRecordInstance = vi.fn();
const mockListRecordInstancesByRecordType = vi.fn();
const mockUpdateRecordInstance = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getRecordType: (...args: unknown[]) => mockGetRecordType(...args),
    createRecordInstance: (...args: unknown[]) => mockCreateRecordInstance(...args),
    getRecordInstance: (...args: unknown[]) => mockGetRecordInstance(...args),
    listRecordInstancesByRecordType: (...args: unknown[]) => mockListRecordInstancesByRecordType(...args),
    updateRecordInstance: (...args: unknown[]) => mockUpdateRecordInstance(...args),
  },
}));

vi.mock("../services/telemetryService", () => ({
  emitTelemetry: vi.fn(),
  buildTelemetryParams: vi.fn(() => ({})),
}));

vi.mock("../services/triggerService", () => ({
  emitRecordEvent: vi.fn(() => Promise.resolve([])),
}));

import {
  createRecordInstance,
  getRecordInstance,
  listRecordInstances,
  updateRecordInstance,
  RecordInstanceServiceError,
} from "../services/recordInstanceService";

const ctxA: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };
const ctxB: TenantContext = { tenantId: "tenant-b", userId: "user-2", source: "header" };

describe("recordInstanceService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a record instance when record type exists", async () => {
    mockGetRecordType.mockResolvedValue({
      id: "rt-1",
      tenantId: "tenant-a",
      name: "Employee",
      key: "employee",
    });

    const created = {
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { name: "Alice" },
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateRecordInstance.mockResolvedValue(created);

    const result = await createRecordInstance(ctxA, {
      recordTypeId: "rt-1",
      data: { name: "Alice" },
    });

    expect(result).toEqual(created);
    expect(mockCreateRecordInstance).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { name: "Alice" },
      createdBy: "user-1",
    });
  });

  it("rejects creation when record type belongs to another tenant", async () => {
    mockGetRecordType.mockResolvedValue({
      id: "rt-1",
      tenantId: "tenant-b",
      name: "Employee",
    });

    await expect(
      createRecordInstance(ctxA, { recordTypeId: "rt-1", data: { name: "Alice" } }),
    ).rejects.toThrow(RecordInstanceServiceError);
  });

  it("fetches a record instance scoped to tenant", async () => {
    const instance = {
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { name: "Alice" },
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockGetRecordInstance.mockResolvedValue(instance);

    const result = await getRecordInstance(ctxA, "ri-1");

    expect(result).toEqual(instance);
    expect(mockGetRecordInstance).toHaveBeenCalledWith("ri-1", "tenant-a");
  });

  it("updates a record instance", async () => {
    const existing = {
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { name: "Alice" },
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockGetRecordInstance.mockResolvedValue(existing);

    const updated = { ...existing, data: { name: "Bob" }, updatedAt: new Date() };
    mockUpdateRecordInstance.mockResolvedValue(updated);

    const result = await updateRecordInstance(ctxA, "ri-1", { name: "Bob" });

    expect(result.data).toEqual({ name: "Bob" });
    expect(mockUpdateRecordInstance).toHaveBeenCalledWith("ri-1", "tenant-a", {
      data: { name: "Bob" },
    });
  });

  it("lists instances by record type scoped to tenant", async () => {
    const instances = [
      { id: "ri-1", tenantId: "tenant-a", recordTypeId: "rt-1", data: { name: "Alice" } },
      { id: "ri-2", tenantId: "tenant-a", recordTypeId: "rt-1", data: { name: "Bob" } },
    ];
    mockListRecordInstancesByRecordType.mockResolvedValue(instances);

    const result = await listRecordInstances(ctxA, "rt-1");

    expect(result).toHaveLength(2);
    expect(mockListRecordInstancesByRecordType).toHaveBeenCalledWith("tenant-a", "rt-1");
  });

  it("enforces tenant isolation — update rejects cross-tenant access", async () => {
    mockGetRecordInstance.mockResolvedValue(undefined);

    await expect(
      updateRecordInstance(ctxB, "ri-1", { name: "Hacker" }),
    ).rejects.toThrow(RecordInstanceServiceError);
  });
});
