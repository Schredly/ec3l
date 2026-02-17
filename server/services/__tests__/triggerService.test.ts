import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { WorkflowTrigger, WorkflowDefinition, WorkflowExecutionIntent } from "@shared/schema";

const mockTenantStorage = {
  getWorkflowDefinition: vi.fn(),
  createWorkflowTrigger: vi.fn(),
  getWorkflowTrigger: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  getWorkflowTriggersByDefinition: vi.fn(),
  updateWorkflowTriggerStatus: vi.fn(),
  getActiveTriggersByTenantAndType: vi.fn(),
  createWorkflowExecutionIntent: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  createTrigger,
  getTrigger,
  fireManualTrigger,
  emitRecordEvent,
  TriggerServiceError,
} from "../triggerService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

const fakeWf: WorkflowDefinition = {
  id: "wf-1",
  tenantId: "tenant-a",
  name: "Deploy",
  triggerType: "manual",
  triggerConfig: null,
  version: 1,
  status: "active",
  changeId: null,
  createdAt: new Date(),
};

const fakeTrigger: WorkflowTrigger = {
  id: "trig-1",
  tenantId: "tenant-a",
  workflowDefinitionId: "wf-1",
  triggerType: "manual",
  triggerConfig: null,
  status: "active",
  createdAt: new Date(),
};

const fakeIntent: WorkflowExecutionIntent = {
  id: "intent-1",
  tenantId: "tenant-a",
  workflowDefinitionId: "wf-1",
  triggerType: "manual",
  triggerPayload: {},
  idempotencyKey: "k",
  status: "pending",
  executionId: null,
  error: null,
  createdAt: new Date(),
  dispatchedAt: null,
};

describe("triggerService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTrigger", () => {
    it("validates workflow ownership via tenant storage", async () => {
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(undefined);
      await expect(
        createTrigger(ctx, { workflowDefinitionId: "wf-bad", triggerType: "manual" }),
      ).rejects.toThrow("Workflow definition not found");
    });

    it("creates trigger when workflow found", async () => {
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(fakeWf);
      mockTenantStorage.createWorkflowTrigger.mockResolvedValue(fakeTrigger);

      const result = await createTrigger(ctx, {
        workflowDefinitionId: "wf-1",
        triggerType: "manual",
      });

      expect(mockTenantStorage.getWorkflowDefinition).toHaveBeenCalledWith("wf-1");
      expect(result).toEqual(fakeTrigger);
    });
  });

  describe("getTrigger", () => {
    it("returns undefined for missing trigger", async () => {
      mockTenantStorage.getWorkflowTrigger.mockResolvedValue(undefined);
      const result = await getTrigger(ctx, "no-id");
      expect(result).toBeUndefined();
    });
  });

  describe("fireManualTrigger", () => {
    it("rejects non-manual trigger type", async () => {
      const scheduleTrigger = { ...fakeTrigger, triggerType: "schedule" as const };
      mockTenantStorage.getWorkflowTrigger.mockResolvedValue(scheduleTrigger);

      await expect(fireManualTrigger(ctx, "trig-1")).rejects.toThrow(
        "Only manual triggers can be fired via this endpoint",
      );
    });

    it("fires a manual trigger", async () => {
      mockTenantStorage.getWorkflowTrigger.mockResolvedValue(fakeTrigger);
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(fakeWf);
      mockTenantStorage.createWorkflowExecutionIntent.mockResolvedValue(fakeIntent);

      const result = await fireManualTrigger(ctx, "trig-1");
      expect(mockTenantStorage.createWorkflowExecutionIntent).toHaveBeenCalledOnce();
      expect(result).toEqual(fakeIntent);
    });
  });

  describe("emitRecordEvent", () => {
    it("matches active triggers by record type", async () => {
      const recordTrigger: WorkflowTrigger = {
        ...fakeTrigger,
        triggerType: "record_event",
        triggerConfig: { recordType: "ticket" },
      };
      mockTenantStorage.getActiveTriggersByTenantAndType.mockResolvedValue([recordTrigger]);
      mockTenantStorage.getWorkflowDefinition.mockResolvedValue(fakeWf);
      mockTenantStorage.createWorkflowExecutionIntent.mockResolvedValue(fakeIntent);

      const result = await emitRecordEvent(ctx, "record.created", "ticket", { title: "Bug" });
      expect(mockTenantStorage.getActiveTriggersByTenantAndType).toHaveBeenCalledWith("record_event");
      expect(result).toHaveLength(1);
    });

    it("skips triggers with non-matching record type", async () => {
      const otherTrigger: WorkflowTrigger = {
        ...fakeTrigger,
        triggerType: "record_event",
        triggerConfig: { recordType: "incident" },
      };
      mockTenantStorage.getActiveTriggersByTenantAndType.mockResolvedValue([otherTrigger]);

      const result = await emitRecordEvent(ctx, "record.created", "ticket", { title: "Bug" });
      expect(result).toHaveLength(0);
    });
  });
});
