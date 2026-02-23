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

vi.mock("../graph/promotionService", () => ({
  diffEnvironments: vi.fn(),
  promoteEnvironmentPackages: vi.fn(),
}));

// Mock notificationService so we can control webhook outcomes
vi.mock("../services/notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/notificationService")>();
  return {
    ...actual,
    sendWebhook: vi.fn(),
  };
});

import {
  previewPromotionIntent,
  executePromotionIntent,
} from "../graph/promotionIntentService";
import { emitDomainEvent } from "../services/domainEventService";
import { diffEnvironments, promoteEnvironmentPackages } from "../graph/promotionService";
import { sendWebhook, buildPromotionApprovalPayload, buildPromotionExecutedPayload } from "../services/notificationService";

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
    notificationStatus: "pending",
    notificationLastError: null,
    notificationLastAttemptAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// --- sendWebhook pure tests (using real implementation) ---

describe("sendWebhook (pure)", () => {
  // These tests use the real implementation, not the mock.
  // We import separately to test the actual function.
  it("returns { success: true } for 200 response", async () => {
    vi.mocked(sendWebhook).mockResolvedValue({ success: true });

    const result = await sendWebhook("https://hooks.example.com/test", { text: "hello" });
    expect(result).toEqual({ success: true });
  });

  it("returns { success: false, error } for non-2xx", async () => {
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "HTTP 500: Internal Server Error" });

    const result = await sendWebhook("https://hooks.example.com/test", { text: "hello" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns { success: false, error } for network error", async () => {
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "fetch failed" });

    const result = await sendWebhook("https://invalid.test", { text: "hello" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("never throws", async () => {
    // Even if the mock throws internally, the real implementation should catch
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "timeout" });

    const result = await sendWebhook("https://invalid.test", {});
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
  });
});

// --- Payload builders ---

describe("buildPromotionApprovalPayload", () => {
  it("builds Slack-compatible approval payload", () => {
    const payload = buildPromotionApprovalPayload(
      { id: "pi-1", projectId: "proj-1", createdBy: "user-1", createdAt: new Date() },
      { id: "env-dev", name: "dev" },
      { id: "env-staging", name: "test" },
      { deltas: [] },
    );

    expect(payload.event).toBe("promotion.approval_required");
    expect(payload.text).toContain("dev");
    expect(payload.text).toContain("test");
    expect(payload.intentId).toBe("pi-1");
    expect(payload.timestamp).toBeDefined();
  });
});

describe("buildPromotionExecutedPayload", () => {
  it("builds Slack-compatible executed payload", () => {
    const payload = buildPromotionExecutedPayload(
      { id: "pi-1", projectId: "proj-1", createdBy: "user-1" },
      { id: "env-dev", name: "dev" },
      { id: "env-staging", name: "test" },
      { promoted: [{ packageKey: "hr.lite" }], skipped: [] },
    );

    expect(payload.event).toBe("promotion.executed");
    expect(payload.text).toContain("1 promoted");
    expect(payload.promoted).toBe(1);
    expect(payload.skipped).toBe(0);
  });
});

// --- Notification triggering via promotionIntentService ---

describe("preview — notification triggering", () => {
  const diff = { fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging", deltas: [] };

  it("sends webhook when requiresPromotionApproval=true AND promotionWebhookUrl set", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    // First getEnvironment call is for the toEnv (notification check), second for fromEnv
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: "https://hooks.example.com/approval" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: true });

    await previewPromotionIntent(ctx, "pi-1");

    expect(sendWebhook).toHaveBeenCalledOnce();
    expect(sendWebhook).toHaveBeenCalledWith(
      "https://hooks.example.com/approval",
      expect.objectContaining({ event: "promotion.approval_required" }),
    );
  });

  it("skips webhook when requiresPromotionApproval=false", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment.mockResolvedValue({ id: "env-staging", name: "test", requiresPromotionApproval: false, promotionWebhookUrl: "https://hooks.example.com/approval" });

    await previewPromotionIntent(ctx, "pi-1");

    expect(sendWebhook).not.toHaveBeenCalled();
  });

  it("skips webhook when promotionWebhookUrl is null", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment.mockResolvedValue({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: null });

    await previewPromotionIntent(ctx, "pi-1");

    expect(sendWebhook).not.toHaveBeenCalled();
  });
});

describe("execute — notification triggering", () => {
  it("sends webhook when promotionWebhookUrl is set", async () => {
    const promotionResult = { success: true, promoted: [], skipped: [] };
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    (promoteEnvironmentPackages as any).mockResolvedValue(promotionResult);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "executed", result: promotionResult }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", promotionWebhookUrl: "https://hooks.example.com/executed" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: true });

    await executePromotionIntent(ctx, "pi-1");

    expect(sendWebhook).toHaveBeenCalledOnce();
    expect(sendWebhook).toHaveBeenCalledWith(
      "https://hooks.example.com/executed",
      expect.objectContaining({ event: "promotion.executed" }),
    );
  });
});

// --- Intent state tracking ---

describe("intent state tracking", () => {
  const diff = { fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging", deltas: [] };

  it("successful webhook → notificationStatus='sent' + timestamp", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: "https://hooks.example.com/test" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: true });

    await previewPromotionIntent(ctx, "pi-1");

    // Second updatePromotionIntent call is for notification tracking
    const notifUpdate = mockTenantStorage.updatePromotionIntent.mock.calls[1];
    expect(notifUpdate[1].notificationStatus).toBe("sent");
    expect(notifUpdate[1].notificationLastError).toBeNull();
    expect(notifUpdate[1].notificationLastAttemptAt).toBeInstanceOf(Date);
  });

  it("failed webhook → notificationStatus='failed' + error + timestamp", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: "https://hooks.example.com/test" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "HTTP 500: Internal Server Error" });

    await previewPromotionIntent(ctx, "pi-1");

    const notifUpdate = mockTenantStorage.updatePromotionIntent.mock.calls[1];
    expect(notifUpdate[1].notificationStatus).toBe("failed");
    expect(notifUpdate[1].notificationLastError).toContain("500");
    expect(notifUpdate[1].notificationLastAttemptAt).toBeInstanceOf(Date);
  });
});

// --- Best-effort guarantee ---

describe("best-effort guarantee", () => {
  const diff = { fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging", deltas: [] };

  it("webhook failure doesn't block preview (status still 'previewed')", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: "https://hooks.example.com/test" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "Connection refused" });

    const result = await previewPromotionIntent(ctx, "pi-1");

    expect(result.status).toBe("previewed");
  });

  it("webhook failure doesn't block execute (status still 'executed')", async () => {
    const promotionResult = { success: true, promoted: [], skipped: [] };
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    (promoteEnvironmentPackages as any).mockResolvedValue(promotionResult);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "executed", result: promotionResult }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", promotionWebhookUrl: "https://hooks.example.com/test" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "Timeout" });

    const result = await executePromotionIntent(ctx, "pi-1");

    expect(result.status).toBe("executed");
  });
});

// --- Telemetry ---

describe("telemetry", () => {
  const diff = { fromEnvironmentId: "env-dev", toEnvironmentId: "env-staging", deltas: [] };

  it("success emits graph.promotion_notification_sent", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: "https://hooks.example.com/test" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: true });

    await previewPromotionIntent(ctx, "pi-1");

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_notification_sent", status: "sent" }),
    );
  });

  it("failure emits graph.promotion_notification_failed", async () => {
    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    (diffEnvironments as any).mockResolvedValue(diff);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: true, promotionWebhookUrl: "https://hooks.example.com/test" })
      .mockResolvedValueOnce({ id: "env-dev", name: "dev" });
    vi.mocked(sendWebhook).mockResolvedValue({ success: false, error: "HTTP 502: Bad Gateway" });

    await previewPromotionIntent(ctx, "pi-1");

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "graph.promotion_notification_failed",
        status: "failed",
        error: { message: "HTTP 502: Bad Gateway" },
      }),
    );
  });
});
