import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { PromotionIntent } from "@shared/schema";

// --- Mocks ---

const mockTenantStorage = {
  getEnvironment: vi.fn(),
  createPromotionIntent: vi.fn(),
  getPromotionIntent: vi.fn(),
  updatePromotionIntent: vi.fn(),
  listPromotionIntents: vi.fn(),
  listEnvironmentPackageInstalls: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

// Mock promotionService functions used by the intent service
vi.mock("../graph/promotionService", () => ({
  diffEnvironments: vi.fn(),
  promoteEnvironmentPackages: vi.fn(),
}));

import {
  createPromotionIntent,
  previewPromotionIntent,
  approvePromotionIntent,
  executePromotionIntent,
  rejectPromotionIntent,
  PromotionIntentError,
} from "../graph/promotionIntentService";
import { emitDomainEvent } from "../services/domainEventService";
import { diffEnvironments, promoteEnvironmentPackages } from "../graph/promotionService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function makeIntent(overrides: Partial<PromotionIntent> = {}): PromotionIntent {
  return {
    id: "pi-1",
    tenantId: "t-1",
    projectId: "proj-1",
    fromEnvironmentId: "env-dev",
    toEnvironmentId: "env-staging",
    status: "draft",
    createdBy: "user-1",
    createdAt: new Date(),
    approvedBy: null,
    approvedAt: null,
    diff: null,
    result: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// --- Create ---

describe("createPromotionIntent", () => {
  it("creates a draft intent when envs exist and differ", async () => {
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" })
      .mockResolvedValueOnce({ id: "env-staging", name: "test" });
    const created = makeIntent();
    mockTenantStorage.createPromotionIntent.mockResolvedValue(created);

    const result = await createPromotionIntent(ctx, {
      projectId: "proj-1",
      fromEnvironmentId: "env-dev",
      toEnvironmentId: "env-staging",
      createdBy: "user-1",
    });

    expect(result.status).toBe("draft");
    expect(mockTenantStorage.createPromotionIntent).toHaveBeenCalledOnce();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_created" }),
    );
  });

  it("rejects when source and target are the same", async () => {
    mockTenantStorage.getEnvironment.mockResolvedValue({ id: "env-dev", name: "dev" });

    await expect(
      createPromotionIntent(ctx, {
        projectId: "proj-1",
        fromEnvironmentId: "env-dev",
        toEnvironmentId: "env-dev",
      }),
    ).rejects.toThrow("must differ");
  });

  it("rejects when source env not found", async () => {
    mockTenantStorage.getEnvironment.mockResolvedValueOnce(undefined);

    await expect(
      createPromotionIntent(ctx, {
        projectId: "proj-1",
        fromEnvironmentId: "env-missing",
        toEnvironmentId: "env-staging",
      }),
    ).rejects.toThrow("Source environment not found");
  });
});

// --- State Machine ---

describe("state machine transitions", () => {
  it("draft → previewed (valid)", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    const diff = { fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging", deltas: [] };
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));

    const result = await previewPromotionIntent(ctx, "pi-1");

    expect(result.status).toBe("previewed");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_previewed" }),
    );
  });

  it("previewed → approved (valid)", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "previewed" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "approved", approvedBy: "user-1" }));

    const result = await approvePromotionIntent(ctx, "pi-1", "user-1");

    expect(result.status).toBe("approved");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_approved" }),
    );
  });

  it("approved → executed (valid)", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    const promotionResult = { success: true, promoted: [], skipped: [] };
    (promoteEnvironmentPackages as any).mockResolvedValue(promotionResult);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "executed", result: promotionResult }));

    const result = await executePromotionIntent(ctx, "pi-1");

    expect(result.status).toBe("executed");
    expect(promoteEnvironmentPackages).toHaveBeenCalledWith(ctx, "env-dev", "env-staging", "proj-1");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_executed" }),
    );
  });

  it("draft → executed blocked", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));

    await expect(executePromotionIntent(ctx, "pi-1")).rejects.toThrow(
      'Invalid state transition: "draft" → "executed"',
    );
  });

  it("rejected → approved blocked", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "rejected" }));

    await expect(approvePromotionIntent(ctx, "pi-1", "user-1")).rejects.toThrow(
      'Invalid state transition: "rejected" → "approved"',
    );
  });

  it("executed → rejected blocked (terminal)", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "executed" }));

    await expect(rejectPromotionIntent(ctx, "pi-1")).rejects.toThrow(
      'Invalid state transition: "executed" → "rejected"',
    );
  });
});

// --- Preview ---

describe("previewPromotionIntent", () => {
  it("stores diff and transitions to previewed", async () => {
    const diff = {
      fromEnvironmentId: "env-dev",
      toEnvironmentId: "env-staging",
      deltas: [{ packageKey: "hr.lite", status: "missing", fromVersion: null, toVersion: "0.2.0", fromChecksum: null, toChecksum: "abc" }],
    };
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));

    const result = await previewPromotionIntent(ctx, "pi-1");

    expect(result.status).toBe("previewed");
    expect(mockTenantStorage.updatePromotionIntent).toHaveBeenCalledWith("pi-1", {
      status: "previewed",
      diff,
    });
  });

  it("allows re-preview from previewed state", async () => {
    const diff = { fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging", deltas: [] };
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "previewed" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));

    const result = await previewPromotionIntent(ctx, "pi-1");
    expect(result.status).toBe("previewed");
  });
});

// --- Approve ---

describe("approvePromotionIntent", () => {
  it("records approvedBy and approvedAt", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "previewed" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(
      makeIntent({ status: "approved", approvedBy: "user-42", approvedAt: new Date() }),
    );

    await approvePromotionIntent(ctx, "pi-1", "user-42");

    const updateCall = mockTenantStorage.updatePromotionIntent.mock.calls[0];
    expect(updateCall[1].approvedBy).toBe("user-42");
    expect(updateCall[1].approvedAt).toBeInstanceOf(Date);
  });

  it("rejects approval from draft state (requires previewed)", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));

    await expect(approvePromotionIntent(ctx, "pi-1", "user-1")).rejects.toThrow(
      'Invalid state transition: "draft" → "approved"',
    );
  });
});

// --- Execute ---

describe("executePromotionIntent", () => {
  it("calls promoteEnvironmentPackages and stores result", async () => {
    const promotionResult = { success: true, promoted: [{ packageKey: "hr.lite", result: { success: true } }], skipped: [] };
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    (promoteEnvironmentPackages as any).mockResolvedValue(promotionResult);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "executed", result: promotionResult }));

    const result = await executePromotionIntent(ctx, "pi-1");

    expect(result.status).toBe("executed");
    expect(promoteEnvironmentPackages).toHaveBeenCalledWith(ctx, "env-dev", "env-staging", "proj-1");
    expect(mockTenantStorage.updatePromotionIntent).toHaveBeenCalledWith("pi-1", {
      status: "executed",
      result: promotionResult,
    });
  });

  it("rejects execution from draft state (requires approved)", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));

    await expect(executePromotionIntent(ctx, "pi-1")).rejects.toThrow(
      'Invalid state transition: "draft" → "executed"',
    );
  });
});

// --- Reject ---

describe("rejectPromotionIntent", () => {
  it("rejects from draft", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "rejected" }));

    const result = await rejectPromotionIntent(ctx, "pi-1");
    expect(result.status).toBe("rejected");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_rejected" }),
    );
  });

  it("rejects from previewed", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "previewed" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "rejected" }));

    const result = await rejectPromotionIntent(ctx, "pi-1");
    expect(result.status).toBe("rejected");
  });

  it("rejects from approved", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "rejected" }));

    const result = await rejectPromotionIntent(ctx, "pi-1");
    expect(result.status).toBe("rejected");
  });
});

// --- Domain Events ---

describe("domain events", () => {
  it("each transition emits the correct event type", async () => {
    // Create
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-dev" })
      .mockResolvedValueOnce({ id: "env-staging" });
    mockTenantStorage.createPromotionIntent.mockResolvedValue(makeIntent());
    await createPromotionIntent(ctx, { projectId: "proj-1", fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging" });
    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: "graph.promotion_intent_created" }));

    vi.mocked(emitDomainEvent).mockClear();

    // Preview
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue({ deltas: [] });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed" }));
    await previewPromotionIntent(ctx, "pi-1");
    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: "graph.promotion_intent_previewed" }));

    vi.mocked(emitDomainEvent).mockClear();

    // Approve
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "previewed" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    await approvePromotionIntent(ctx, "pi-1", "user-1");
    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: "graph.promotion_intent_approved" }));

    vi.mocked(emitDomainEvent).mockClear();

    // Execute
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    (promoteEnvironmentPackages as any).mockResolvedValue({ success: true, promoted: [], skipped: [] });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "executed" }));
    await executePromotionIntent(ctx, "pi-1");
    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: "graph.promotion_intent_executed" }));

    vi.mocked(emitDomainEvent).mockClear();

    // Reject
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "rejected" }));
    await rejectPromotionIntent(ctx, "pi-1");
    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({ type: "graph.promotion_intent_rejected" }));
  });
});
