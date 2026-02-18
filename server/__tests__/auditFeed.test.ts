import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

const mockGetChangeEvents = vi.fn();
const mockGetRbacAuditLogs = vi.fn();
const mockGetExecutionTelemetryEvents = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getChangeEvents: (...args: unknown[]) => mockGetChangeEvents(...args),
    getRbacAuditLogs: (...args: unknown[]) => mockGetRbacAuditLogs(...args),
    getExecutionTelemetryEvents: (...args: unknown[]) => mockGetExecutionTelemetryEvents(...args),
  },
}));

import { getAuditFeed } from "../services/auditFeedService";

const ctxA: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };
const ctxB: TenantContext = { tenantId: "tenant-b", userId: "user-2", source: "header" };

describe("auditFeedService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetChangeEvents.mockResolvedValue([]);
    mockGetRbacAuditLogs.mockResolvedValue([]);
    mockGetExecutionTelemetryEvents.mockResolvedValue([]);
  });

  it("aggregates change events and telemetry events into a unified feed", async () => {
    mockGetChangeEvents.mockResolvedValue([
      {
        id: "ce-1",
        tenantId: "tenant-a",
        projectId: "proj-1",
        changeId: "change-1",
        eventType: "change_status_changed",
        payload: { from: "Ready", to: "Merged" },
        createdAt: new Date("2025-06-01T10:00:00Z"),
      },
    ]);

    mockGetExecutionTelemetryEvents.mockResolvedValue([
      {
        id: "te-1",
        eventType: "execution_completed",
        timestamp: new Date("2025-06-01T10:00:01Z"),
        tenantId: "tenant-a",
        moduleId: "system",
        executionType: "task",
        workflowId: null,
        workflowStepId: null,
        executionId: "change-1",
        actorType: "user",
        actorId: "user-1",
        status: "merged",
        errorCode: null,
        errorMessage: null,
        affectedRecordIds: null,
      },
    ]);

    const feed = await getAuditFeed(ctxA);

    expect(feed).toHaveLength(2);
    expect(feed[0].source).toBe("telemetry");
    expect(feed[1].source).toBe("change");
    expect(feed[0].entityId).toBe("change-1");
    expect(feed[1].entityId).toBe("change-1");
  });

  it("scopes queries to the correct tenant", async () => {
    await getAuditFeed(ctxA);

    expect(mockGetChangeEvents).toHaveBeenCalledWith("tenant-a", 50);
    expect(mockGetRbacAuditLogs).toHaveBeenCalledWith("tenant-a", 50);
    expect(mockGetExecutionTelemetryEvents).toHaveBeenCalledWith("tenant-a", { limit: 50 });

    vi.resetAllMocks();
    mockGetChangeEvents.mockResolvedValue([]);
    mockGetRbacAuditLogs.mockResolvedValue([]);
    mockGetExecutionTelemetryEvents.mockResolvedValue([]);

    await getAuditFeed(ctxB);

    expect(mockGetChangeEvents).toHaveBeenCalledWith("tenant-b", 50);
    expect(mockGetRbacAuditLogs).toHaveBeenCalledWith("tenant-b", 50);
    expect(mockGetExecutionTelemetryEvents).toHaveBeenCalledWith("tenant-b", { limit: 50 });
  });

  it("sorts entries descending by timestamp", async () => {
    const t1 = new Date("2025-06-01T08:00:00Z");
    const t2 = new Date("2025-06-01T09:00:00Z");
    const t3 = new Date("2025-06-01T10:00:00Z");

    mockGetChangeEvents.mockResolvedValue([
      {
        id: "ce-old",
        tenantId: "tenant-a",
        projectId: "proj-1",
        changeId: "change-1",
        eventType: "change_status_changed",
        payload: null,
        createdAt: t1,
      },
    ]);

    mockGetRbacAuditLogs.mockResolvedValue([
      {
        id: "rl-mid",
        tenantId: "tenant-a",
        actorType: "user",
        actorId: "user-1",
        permission: "admin.view",
        resourceType: "tenant",
        resourceId: "tenant-a",
        outcome: "allowed",
        reason: null,
        timestamp: t3,
      },
    ]);

    mockGetExecutionTelemetryEvents.mockResolvedValue([
      {
        id: "te-mid",
        eventType: "execution_started",
        timestamp: t2,
        tenantId: "tenant-a",
        moduleId: "system",
        executionType: "task",
        workflowId: null,
        workflowStepId: null,
        executionId: "change-2",
        actorType: "user",
        actorId: "user-1",
        status: "started",
        errorCode: null,
        errorMessage: null,
        affectedRecordIds: null,
      },
    ]);

    const feed = await getAuditFeed(ctxA);

    expect(feed).toHaveLength(3);
    expect(feed[0].id).toBe("rl-mid");  // t3 — newest
    expect(feed[1].id).toBe("te-mid");  // t2
    expect(feed[2].id).toBe("ce-old");  // t1 — oldest
  });
});
