import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

const mockGetRecordType = vi.fn();
const mockCreateRecordInstance = vi.fn();
const mockGetRecordInstance = vi.fn();
const mockUpdateRecordInstance = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getRecordType: (...args: unknown[]) => mockGetRecordType(...args),
    createRecordInstance: (...args: unknown[]) => mockCreateRecordInstance(...args),
    getRecordInstance: (...args: unknown[]) => mockGetRecordInstance(...args),
    updateRecordInstance: (...args: unknown[]) => mockUpdateRecordInstance(...args),
  },
}));

vi.mock("../services/telemetryService", () => ({
  emitTelemetry: vi.fn(),
  buildTelemetryParams: vi.fn(() => ({})),
}));

const mockEmitRecordEvent = vi.fn();

vi.mock("../services/triggerService", () => ({
  emitRecordEvent: (...args: unknown[]) => mockEmitRecordEvent(...args),
}));

import {
  createRecordInstance,
  updateRecordInstance,
} from "../services/recordInstanceService";

const ctxA: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };
const ctxB: TenantContext = { tenantId: "tenant-b", userId: "user-2", source: "header" };

const fakeRecordType = {
  id: "rt-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  name: "Ticket",
  key: "ticket",
  schema: { fields: [] },
  version: 1,
  status: "active",
  createdAt: new Date(),
};

describe("recordInstance trigger integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEmitRecordEvent.mockResolvedValue([]);
  });

  it("emits record.created event after creating an instance", async () => {
    mockGetRecordType.mockResolvedValue(fakeRecordType);
    const created = {
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Bug report" },
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCreateRecordInstance.mockResolvedValue(created);

    await createRecordInstance(ctxA, {
      recordTypeId: "rt-1",
      data: { title: "Bug report" },
    });

    expect(mockEmitRecordEvent).toHaveBeenCalledWith(
      ctxA,
      "record.created",
      "ticket",
      { title: "Bug report" },
    );
  });

  it("emits record.updated event after updating an instance", async () => {
    const existing = {
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Bug report" },
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockGetRecordInstance.mockResolvedValue(existing);
    mockUpdateRecordInstance.mockResolvedValue({
      ...existing,
      data: { title: "Updated bug" },
      updatedAt: new Date(),
    });
    mockGetRecordType.mockResolvedValue(fakeRecordType);

    await updateRecordInstance(ctxA, "ri-1", { title: "Updated bug" });

    expect(mockEmitRecordEvent).toHaveBeenCalledWith(
      ctxA,
      "record.updated",
      "ticket",
      { title: "Updated bug" },
    );
  });

  it("does not emit trigger for cross-tenant record type", async () => {
    mockGetRecordType.mockResolvedValue({
      ...fakeRecordType,
      tenantId: "tenant-a",
    });

    await expect(
      createRecordInstance(ctxB, {
        recordTypeId: "rt-1",
        data: { title: "Hacker" },
      }),
    ).rejects.toThrow("Record type not found");

    expect(mockEmitRecordEvent).not.toHaveBeenCalled();
  });
});
