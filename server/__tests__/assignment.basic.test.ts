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

const mockEmitTelemetry = vi.fn();
const mockBuildTelemetryParams = vi.fn((_ctx: unknown, overrides: Record<string, unknown>) => overrides);

vi.mock("../services/telemetryService", () => ({
  emitTelemetry: (...args: unknown[]) => mockEmitTelemetry(...args),
  buildTelemetryParams: (...args: unknown[]) => mockBuildTelemetryParams(...args),
}));

vi.mock("../services/triggerService", () => ({
  emitRecordEvent: vi.fn(() => Promise.resolve([])),
}));

import {
  createRecordInstance,
  RecordInstanceServiceError,
} from "../services/recordInstanceService";

const ctxA: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };
const ctxB: TenantContext = { tenantId: "tenant-b", userId: "user-2", source: "header" };

const baseRecordType = {
  id: "rt-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  name: "Incident",
  key: "incident",
  schema: { fields: [] },
  assignmentConfig: null,
  version: 1,
  status: "active",
  createdAt: new Date(),
};

describe("assignment on record instance creation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("applies static_user assignment on record create", async () => {
    mockGetRecordType.mockResolvedValue({
      ...baseRecordType,
      assignmentConfig: { type: "static_user", value: "user-42" },
    });

    const created = {
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Server down" },
      createdBy: "user-1",
      assignedTo: "user-42",
      assignedGroup: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateRecordInstance.mockResolvedValue(created);

    const result = await createRecordInstance(ctxA, {
      recordTypeId: "rt-1",
      data: { title: "Server down" },
    });

    expect(result.assignedTo).toBe("user-42");
    expect(mockCreateRecordInstance).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: "user-42" }),
    );
  });

  it("applies static_group assignment on record create", async () => {
    mockGetRecordType.mockResolvedValue({
      ...baseRecordType,
      assignmentConfig: { type: "static_group", value: "ops-team" },
    });

    const created = {
      id: "ri-2",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Disk full" },
      createdBy: "user-1",
      assignedTo: null,
      assignedGroup: "ops-team",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateRecordInstance.mockResolvedValue(created);

    const result = await createRecordInstance(ctxA, {
      recordTypeId: "rt-1",
      data: { title: "Disk full" },
    });

    expect(result.assignedGroup).toBe("ops-team");
    expect(mockCreateRecordInstance).toHaveBeenCalledWith(
      expect.objectContaining({ assignedGroup: "ops-team" }),
    );
  });

  it("does not assign when no assignmentConfig exists", async () => {
    mockGetRecordType.mockResolvedValue(baseRecordType);

    const created = {
      id: "ri-3",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "All good" },
      createdBy: "user-1",
      assignedTo: null,
      assignedGroup: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateRecordInstance.mockResolvedValue(created);

    await createRecordInstance(ctxA, {
      recordTypeId: "rt-1",
      data: { title: "All good" },
    });

    expect(mockCreateRecordInstance).toHaveBeenCalledWith(
      expect.not.objectContaining({ assignedTo: expect.anything() }),
    );
  });

  it("preserves tenant isolation — rejects cross-tenant record type", async () => {
    mockGetRecordType.mockResolvedValue({
      ...baseRecordType,
      tenantId: "tenant-a",
      assignmentConfig: { type: "static_user", value: "user-42" },
    });

    await expect(
      createRecordInstance(ctxB, {
        recordTypeId: "rt-1",
        data: { title: "Hacker" },
      }),
    ).rejects.toThrow(RecordInstanceServiceError);

    expect(mockCreateRecordInstance).not.toHaveBeenCalled();
  });

  it("emits record.assigned telemetry on assignment", async () => {
    mockGetRecordType.mockResolvedValue({
      ...baseRecordType,
      assignmentConfig: { type: "static_user", value: "user-42" },
    });

    const created = {
      id: "ri-4",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Alert" },
      createdBy: "user-1",
      assignedTo: "user-42",
      assignedGroup: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateRecordInstance.mockResolvedValue(created);

    await createRecordInstance(ctxA, {
      recordTypeId: "rt-1",
      data: { title: "Alert" },
    });

    // Should emit two telemetry calls: execution_completed + record.assigned
    expect(mockEmitTelemetry).toHaveBeenCalledTimes(2);
    expect(mockEmitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "record.assigned",
        executionId: "ri-4",
        status: "assigned",
      }),
    );
  });
});
