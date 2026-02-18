import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

const mockCreateEvent = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    createExecutionTelemetryEvent: (...args: unknown[]) => mockCreateEvent(...args),
  },
}));

import { emitTelemetry, buildTelemetryParams } from "../services/telemetryService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-42", source: "header" };

describe("telemetryService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("emitTelemetry writes to storage", async () => {
    mockCreateEvent.mockResolvedValue({ id: "evt-1" });

    const params = buildTelemetryParams(ctx, {
      eventType: "execution_completed",
      executionType: "task",
      executionId: "change-1",
      status: "merged",
    });

    emitTelemetry(params);

    // Let the microtask resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCreateEvent).toHaveBeenCalledOnce();
    const arg = mockCreateEvent.mock.calls[0][0];
    expect(arg).toMatchObject({
      tenantId: "t-1",
      eventType: "execution_completed",
      executionType: "task",
      executionId: "change-1",
      status: "merged",
      actorType: "user",
      actorId: "user-42",
      moduleId: "system",
    });
  });

  it("emitTelemetry swallows errors", async () => {
    mockCreateEvent.mockRejectedValue(new Error("DB down"));

    const params = buildTelemetryParams(ctx, {
      eventType: "execution_failed",
      executionType: "task",
      executionId: "change-2",
      status: "failed",
    });

    // Must not throw
    expect(() => emitTelemetry(params)).not.toThrow();

    // Let the rejection propagate through the catch handler
    await new Promise((r) => setTimeout(r, 10));
  });

  it("buildTelemetryParams resolves actor from TenantContext", () => {
    const userCtx: TenantContext = { tenantId: "t-1", userId: "user-42", source: "header" };
    const agentCtx: TenantContext = { tenantId: "t-1", agentId: "agent-7", source: "system" };
    const systemCtx: TenantContext = { tenantId: "t-1", source: "system" };

    const userParams = buildTelemetryParams(userCtx, {
      eventType: "execution_started",
      executionType: "task",
      status: "started",
    });
    expect(userParams.actorType).toBe("user");
    expect(userParams.actorId).toBe("user-42");

    const agentParams = buildTelemetryParams(agentCtx, {
      eventType: "execution_started",
      executionType: "task",
      status: "started",
    });
    expect(agentParams.actorType).toBe("agent");
    expect(agentParams.actorId).toBe("agent-7");

    const systemParams = buildTelemetryParams(systemCtx, {
      eventType: "execution_started",
      executionType: "task",
      status: "started",
    });
    expect(systemParams.actorType).toBe("system");
    expect(systemParams.actorId).toBeNull();
  });
});
