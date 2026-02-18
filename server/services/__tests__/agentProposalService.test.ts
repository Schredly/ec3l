import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { AgentProposal, ChangeRecord } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  createChange: vi.fn(),
  createAgentProposal: vi.fn(),
  createAgentRun: vi.fn(),
  updateAgentRun: vi.fn(),
  getAgentProposal: vi.fn(),
  getAgentProposalsByChange: vi.fn(),
  getAgentProposalsByTenant: vi.fn(),
  updateAgentProposalStatus: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("@shared/schema", () => ({
  formPatchOperationsSchema: {
    safeParse: (val: unknown) => ({ success: true, data: val }),
  },
}));

vi.mock("../rbacService", () => ({
  agentActor: (id: string) => ({ actorType: "agent", actorId: id }),
  authorize: vi.fn().mockResolvedValue(undefined),
  PERMISSIONS: { CHANGE_APPROVE: "change:approve" },
}));

import {
  createProposal,
  getProposal,
  getProposalsByChange,
  getProposalsByTenant,
  submitProposal,
  reviewProposal,
  AgentProposalError,
} from "../agentProposalService";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Test",
  description: null,
  status: "Draft",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const fakeProposal: AgentProposal = {
  id: "prop-1",
  tenantId: "tenant-a",
  changeId: "change-1",
  agentId: "agent-1",
  proposalType: "form_patch",
  targetRef: "form:ticket",
  payload: { operations: [{ op: "set_value", field: "title", value: "test" }] },
  summary: "Auto fix",
  status: "draft",
  createdAt: new Date(),
};

describe("agentProposalService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createProposal", () => {
    it("creates a proposal with a new change when no changeId", async () => {
      mockTenantStorage.createChange.mockResolvedValue(fakeChange);
      mockTenantStorage.createAgentProposal.mockResolvedValue(fakeProposal);
      mockTenantStorage.createAgentRun.mockResolvedValue({ id: "run-1" });
      mockTenantStorage.updateAgentRun.mockResolvedValue({ id: "run-1" });

      const result = await createProposal(ctx, {
        agentId: "agent-1",
        proposalType: "approval_comment",
        targetRef: "form:ticket",
        payload: { comment: "Looks good" },
        summary: "Auto fix",
        projectId: "proj-1",
      });

      expect(mockTenantStorage.createChange).toHaveBeenCalledOnce();
      expect(mockTenantStorage.createAgentProposal).toHaveBeenCalledOnce();
      expect(result).toEqual(fakeProposal);
    });

    it("uses existing change when changeId provided", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.createAgentProposal.mockResolvedValue(fakeProposal);
      mockTenantStorage.createAgentRun.mockResolvedValue({ id: "run-1" });
      mockTenantStorage.updateAgentRun.mockResolvedValue({ id: "run-1" });

      const result = await createProposal(ctx, {
        agentId: "agent-1",
        proposalType: "approval_comment",
        targetRef: "form:ticket",
        payload: { comment: "Looks good" },
        changeId: "change-1",
      });

      expect(mockTenantStorage.createChange).not.toHaveBeenCalled();
      expect(mockTenantStorage.getChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual(fakeProposal);
    });
  });

  describe("getProposal", () => {
    it("returns undefined for missing proposal", async () => {
      mockTenantStorage.getAgentProposal.mockResolvedValue(undefined);
      const result = await getProposal(ctx, "no-such-id");
      expect(result).toBeUndefined();
    });

    it("returns proposal when found", async () => {
      mockTenantStorage.getAgentProposal.mockResolvedValue(fakeProposal);
      const result = await getProposal(ctx, "prop-1");
      expect(result).toEqual(fakeProposal);
    });
  });

  describe("getProposalsByChange", () => {
    it("delegates to ts.getAgentProposalsByChange", async () => {
      mockTenantStorage.getAgentProposalsByChange.mockResolvedValue([fakeProposal]);
      const result = await getProposalsByChange(ctx, "change-1");
      expect(mockTenantStorage.getAgentProposalsByChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual([fakeProposal]);
    });
  });

  describe("getProposalsByTenant", () => {
    it("delegates to ts.getAgentProposalsByTenant", async () => {
      mockTenantStorage.getAgentProposalsByTenant.mockResolvedValue([fakeProposal]);
      const result = await getProposalsByTenant(ctx);
      expect(mockTenantStorage.getAgentProposalsByTenant).toHaveBeenCalledOnce();
      expect(result).toEqual([fakeProposal]);
    });
  });

  describe("submitProposal", () => {
    it("throws on missing proposal", async () => {
      mockTenantStorage.getAgentProposal.mockResolvedValue(undefined);
      await expect(submitProposal(ctx, "no-id", { actorType: "user", actorId: "u1" }))
        .rejects.toThrow(AgentProposalError);
    });

    it("submits a draft proposal", async () => {
      mockTenantStorage.getAgentProposal.mockResolvedValue(fakeProposal);
      mockTenantStorage.updateAgentProposalStatus.mockResolvedValue({ ...fakeProposal, status: "submitted" });

      const result = await submitProposal(ctx, "prop-1", { actorType: "user", actorId: "u1" });
      expect(result.status).toBe("submitted");
    });
  });

  describe("reviewProposal", () => {
    it("throws on missing proposal", async () => {
      mockTenantStorage.getAgentProposal.mockResolvedValue(undefined);
      await expect(reviewProposal(ctx, "no-id", "accepted", { actorType: "user", actorId: "u1" }))
        .rejects.toThrow(AgentProposalError);
    });

    it("accepts a submitted proposal", async () => {
      const submitted = { ...fakeProposal, status: "submitted" as const };
      mockTenantStorage.getAgentProposal.mockResolvedValue(submitted);
      mockTenantStorage.updateAgentProposalStatus.mockResolvedValue({ ...submitted, status: "accepted" });

      const result = await reviewProposal(ctx, "prop-1", "accepted", { actorType: "user", actorId: "u1" });
      expect(result.status).toBe("accepted");
    });
  });
});
