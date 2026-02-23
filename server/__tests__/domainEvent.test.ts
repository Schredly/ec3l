import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

const mockCreateExecutionTelemetryEvent = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    createExecutionTelemetryEvent: (...args: unknown[]) =>
      mockCreateExecutionTelemetryEvent(...args),
  },
}));

import {
  emitDomainEvent,
  subscribe,
  clearSubscribers,
} from "../services/domainEventService";

describe("emitDomainEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearSubscribers();
    mockCreateExecutionTelemetryEvent.mockResolvedValue({});
  });

  it("resolves actorType=user when ctx has userId", () => {
    const ctx: TenantContext = { tenantId: "t-1", userId: "u-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_completed",
      status: "created",
      entityId: "ri-1",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        actorType: "user",
        actorId: "u-1",
      }),
    );
  });

  it("resolves actorType=agent when ctx has agentId", () => {
    const ctx: TenantContext = { tenantId: "t-1", agentId: "a-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_completed",
      status: "created",
      entityId: "ri-1",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "agent",
        actorId: "a-1",
      }),
    );
  });

  it("resolves actorType=system when ctx has neither userId nor agentId", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_completed",
      status: "created",
      entityId: "ri-1",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "system",
        actorId: null,
      }),
    );
  });

  it("derives executionType=workflow_step when workflowId is set", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_started",
      status: "started",
      entityId: "exec-1",
      workflowId: "wf-1",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: "workflow_step",
        workflowId: "wf-1",
      }),
    );
  });

  it("derives executionType=task when workflowId is absent", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_completed",
      status: "completed",
      entityId: "change-1",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: "task",
        workflowId: null,
      }),
    );
  });

  it("maps error fields to errorCode and errorMessage", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_failed",
      status: "failed",
      entityId: "change-1",
      error: { code: "SCHEMA_ERR", message: "Field not found" },
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "SCHEMA_ERR",
        errorMessage: "Field not found",
      }),
    );
  });

  it("maps error without code to null errorCode", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_failed",
      status: "failed",
      entityId: "change-1",
      error: { message: "Something broke" },
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: null,
        errorMessage: "Something broke",
      }),
    );
  });

  it("defaults moduleId to 'system' when not provided", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_completed",
      status: "completed",
      entityId: "e-1",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: "system" }),
    );
  });

  it("uses explicit moduleId when provided", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "execution_started",
      status: "started",
      entityId: "e-1",
      moduleId: "mod-42",
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: "mod-42" }),
    );
  });

  it("never throws — catches storage errors silently", async () => {
    mockCreateExecutionTelemetryEvent.mockRejectedValue(new Error("DB down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    // Should not throw
    emitDomainEvent(ctx, {
      type: "execution_completed",
      status: "completed",
      entityId: "e-1",
    });

    // Allow the rejected promise to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[domain-event] Failed to emit execution_completed"),
    );

    consoleSpy.mockRestore();
  });

  it("passes affectedRecords as affectedRecordIds", () => {
    const ctx: TenantContext = { tenantId: "t-1", source: "header" };

    emitDomainEvent(ctx, {
      type: "record.assigned",
      status: "assigned",
      entityId: "ri-1",
      affectedRecords: { recordId: "ri-1", assignedTo: "user-42" },
    });

    expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedRecordIds: { recordId: "ri-1", assignedTo: "user-42" },
      }),
    );
  });

  describe("in-memory pub-sub", () => {
    it("handler receives events of the registered type", async () => {
      const handler = vi.fn();
      subscribe("record.assigned", handler);

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: "record.assigned" }));
    });

    it("handler does not receive events of a different type", async () => {
      const handler = vi.fn();
      subscribe("record.sla.breached", handler);

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(handler).not.toHaveBeenCalled();
    });

    it("multiple handlers for same type all fire", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      subscribe("record.assigned", handler1);
      subscribe("record.assigned", handler2);

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it("handler error does not affect other handlers", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const badHandler = vi.fn().mockRejectedValue(new Error("boom"));
      const goodHandler = vi.fn();
      subscribe("record.assigned", badHandler);
      subscribe("record.assigned", goodHandler);

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(goodHandler).toHaveBeenCalledOnce();
      consoleSpy.mockRestore();
    });

    it("handler error never propagates to emitter", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      subscribe("record.assigned", () => {
        throw new Error("sync boom");
      });

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };

      expect(() =>
        emitDomainEvent(ctx, {
          type: "record.assigned",
          status: "assigned",
          entityId: "ri-1",
        }),
      ).not.toThrow();

      consoleSpy.mockRestore();
    });

    it("unsubscribe prevents future calls", async () => {
      const handler = vi.fn();
      const unsub = subscribe("record.assigned", handler);
      unsub();

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(handler).not.toHaveBeenCalled();
    });

    it("clearSubscribers removes all handlers", async () => {
      const handler = vi.fn();
      subscribe("record.assigned", handler);
      subscribe("record.sla.breached", handler);
      clearSubscribers();

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(handler).not.toHaveBeenCalled();
    });

    it("DB write still happens when subscribers are registered", () => {
      subscribe("record.assigned", vi.fn());

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      expect(mockCreateExecutionTelemetryEvent).toHaveBeenCalledOnce();
    });

    it("async handler errors are caught", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      subscribe("record.assigned", async () => {
        throw new Error("async boom");
      });

      const ctx: TenantContext = { tenantId: "t-1", source: "header" };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[domain-event] Subscriber error for record.assigned"),
      );
      consoleSpy.mockRestore();
    });

    it("handler receives full TenantContext", async () => {
      const handler = vi.fn();
      subscribe("record.assigned", handler);

      const ctx: TenantContext = {
        tenantId: "t-1",
        userId: "u-42",
        source: "header",
      };
      emitDomainEvent(ctx, {
        type: "record.assigned",
        status: "assigned",
        entityId: "ri-1",
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "t-1", userId: "u-42", source: "header" }),
        expect.any(Object),
      );
    });
  });
});
