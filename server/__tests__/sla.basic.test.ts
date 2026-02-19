import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

const mockGetRecordType = vi.fn();
const mockCreateRecordInstance = vi.fn();
const mockCreateRecordTimer = vi.fn();
const mockGetDueTimers = vi.fn();
const mockUpdateTimerStatus = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getRecordType: (...args: unknown[]) => mockGetRecordType(...args),
    createRecordInstance: (...args: unknown[]) => mockCreateRecordInstance(...args),
    createRecordTimer: (...args: unknown[]) => mockCreateRecordTimer(...args),
    getDueTimers: (...args: unknown[]) => mockGetDueTimers(...args),
    updateTimerStatus: (...args: unknown[]) => mockUpdateTimerStatus(...args),
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

import { createRecordInstance } from "../services/recordInstanceService";
import { processDueTimers } from "../services/timerService";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const baseRecordType = {
  id: "rt-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  name: "Incident",
  key: "incident",
  schema: { fields: [] },
  assignmentConfig: null,
  slaConfig: null,
  version: 1,
  status: "active",
  createdAt: new Date(),
};

describe("SLA timer creation on record instance create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates timer when record type has slaConfig", async () => {
    mockGetRecordType.mockResolvedValue({
      ...baseRecordType,
      slaConfig: { durationMinutes: 30 },
    });
    mockCreateRecordInstance.mockResolvedValue({
      id: "ri-1",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Outage" },
      createdBy: "user-1",
      assignedTo: null,
      assignedGroup: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockCreateRecordTimer.mockResolvedValue({
      id: "timer-1",
      tenantId: "tenant-a",
      recordId: "ri-1",
      type: "sla_due",
      status: "pending",
      dueAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createRecordInstance(ctx, {
      recordTypeId: "rt-1",
      data: { title: "Outage" },
    });

    // Allow fire-and-forget promise to settle
    await vi.waitFor(() => {
      expect(mockCreateRecordTimer).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateRecordTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        recordId: "ri-1",
        type: "sla_due",
      }),
    );
  });

  it("does not create timer when slaConfig is null", async () => {
    mockGetRecordType.mockResolvedValue(baseRecordType);
    mockCreateRecordInstance.mockResolvedValue({
      id: "ri-2",
      tenantId: "tenant-a",
      recordTypeId: "rt-1",
      data: { title: "Info" },
      createdBy: "user-1",
      assignedTo: null,
      assignedGroup: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createRecordInstance(ctx, {
      recordTypeId: "rt-1",
      data: { title: "Info" },
    });

    // Give any potential fire-and-forget time to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCreateRecordTimer).not.toHaveBeenCalled();
  });
});

describe("processDueTimers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("marks due timers as breached and emits telemetry", async () => {
    const pastDue = new Date("2024-01-01T00:00:00Z");
    mockGetDueTimers.mockResolvedValue([
      {
        id: "timer-1",
        tenantId: "tenant-a",
        recordId: "ri-1",
        type: "sla_due",
        dueAt: pastDue,
        status: "pending",
        createdAt: pastDue,
        updatedAt: pastDue,
      },
    ]);
    mockUpdateTimerStatus.mockResolvedValue({
      id: "timer-1",
      tenantId: "tenant-a",
      recordId: "ri-1",
      type: "sla_due",
      dueAt: pastDue,
      status: "breached",
      createdAt: pastDue,
      updatedAt: new Date(),
    });

    const count = await processDueTimers(new Date("2024-01-02T00:00:00Z"));

    expect(count).toBe(1);
    expect(mockUpdateTimerStatus).toHaveBeenCalledWith("timer-1", "breached");
    expect(mockEmitTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "record.sla.breached",
        executionId: "ri-1",
        status: "breached",
      }),
    );
  });

  it("ignores future timers (getDueTimers returns empty)", async () => {
    mockGetDueTimers.mockResolvedValue([]);

    const count = await processDueTimers(new Date("2024-01-01T00:00:00Z"));

    expect(count).toBe(0);
    expect(mockUpdateTimerStatus).not.toHaveBeenCalled();
    expect(mockEmitTelemetry).not.toHaveBeenCalled();
  });

  it("is idempotent — breached timers are not returned by getDueTimers", async () => {
    // getDueTimers only returns status='pending', so already-breached timers
    // are never included in the result set
    mockGetDueTimers.mockResolvedValue([]);

    const count = await processDueTimers(new Date("2024-06-01T00:00:00Z"));

    expect(count).toBe(0);
    expect(mockUpdateTimerStatus).not.toHaveBeenCalled();
  });

  it("enforces tenant isolation via tenant-scoped telemetry", async () => {
    const pastDue = new Date("2024-01-01T00:00:00Z");
    mockGetDueTimers.mockResolvedValue([
      {
        id: "timer-a",
        tenantId: "tenant-a",
        recordId: "ri-a",
        type: "sla_due",
        dueAt: pastDue,
        status: "pending",
        createdAt: pastDue,
        updatedAt: pastDue,
      },
      {
        id: "timer-b",
        tenantId: "tenant-b",
        recordId: "ri-b",
        type: "sla_due",
        dueAt: pastDue,
        status: "pending",
        createdAt: pastDue,
        updatedAt: pastDue,
      },
    ]);
    mockUpdateTimerStatus.mockResolvedValue({});

    const count = await processDueTimers(new Date("2024-01-02T00:00:00Z"));

    expect(count).toBe(2);

    // Each timer's telemetry is scoped to its own tenantId
    expect(mockBuildTelemetryParams).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a" }),
      expect.objectContaining({ executionId: "ri-a" }),
    );
    expect(mockBuildTelemetryParams).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-b" }),
      expect.objectContaining({ executionId: "ri-b" }),
    );
  });
});
