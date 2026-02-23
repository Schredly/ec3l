import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import { computePackageChecksum } from "../graph/installGraphService";

// --- Mocks ---

const mockTenantStorage = {
  createVibeDraft: vi.fn(),
  getVibeDraft: vi.fn(),
  updateVibeDraft: vi.fn(),
  listRecordTypes: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  createVibeDraftVersion: vi.fn(),
  getLatestVibeDraftVersionNumber: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import { generateVariantsWithPreview, MultiVariantError } from "../vibe/multiVariantService";
import { createDraftFromVariant, VibeDraftError } from "../vibe/vibeDraftService";
import { emitDomainEvent } from "../services/domainEventService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function setupEmptyGraphMocks() {
  mockTenantStorage.listRecordTypes.mockResolvedValue([]);
  mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
  mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
}

// Uses the real stub LLM adapter which matches templates by keyword.
// "ticketing" matches the simpleTicketingApp template.

describe("generateVariantsWithPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("generates N variants with matching prompt", async () => {
    const variants = await generateVariantsWithPreview(ctx, "proj-1", "ticketing", 3);

    expect(variants).toHaveLength(3);
    for (const v of variants) {
      expect(v.package.packageKey).toMatch(/^vibe\./);
      expect(v.package.recordTypes.length).toBeGreaterThan(0);
    }
  });

  it("each variant has diff, checksum, and validationErrors", async () => {
    const variants = await generateVariantsWithPreview(ctx, "proj-1", "ticketing", 2);

    for (const v of variants) {
      expect(v.diff).toBeDefined();
      expect(v.diff.addedRecordTypes).toBeInstanceOf(Array);
      expect(v.checksum).toBeDefined();
      expect(typeof v.checksum).toBe("string");
      expect(v.validationErrors).toBeInstanceOf(Array);
    }
  });

  it("overrides packageKey with appName", async () => {
    const variants = await generateVariantsWithPreview(ctx, "proj-1", "ticketing", 1, "My App");

    expect(variants).toHaveLength(1);
    expect(variants[0]!.package.packageKey).toBe("vibe.my_app");
  });

  it("returns empty for unmatched prompt (stub returns null)", async () => {
    const variants = await generateVariantsWithPreview(ctx, "proj-1", "xyznonexistent", 3);

    expect(variants).toHaveLength(0);
  });

  it("throws on count > 5", async () => {
    await expect(
      generateVariantsWithPreview(ctx, "proj-1", "ticketing", 6),
    ).rejects.toThrow(MultiVariantError);
  });

  it("throws on count < 1", async () => {
    await expect(
      generateVariantsWithPreview(ctx, "proj-1", "ticketing", 0),
    ).rejects.toThrow(MultiVariantError);
  });

  it("emits variant_generation_requested event", async () => {
    await generateVariantsWithPreview(ctx, "proj-1", "ticketing", 2);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.variant_generation_requested",
        status: "started",
        affectedRecords: expect.objectContaining({
          prompt: "ticketing",
          count: 2,
        }),
      }),
    );
  });

  it("emits variant_generation_completed event with counts", async () => {
    await generateVariantsWithPreview(ctx, "proj-1", "ticketing", 2);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.variant_generation_completed",
        status: "completed",
        affectedRecords: expect.objectContaining({
          requested: 2,
          generated: 2,
          excluded: 0,
        }),
      }),
    );
  });

  it("counts excluded variants in telemetry", async () => {
    // "xyznonexistent" matches nothing → all excluded
    await generateVariantsWithPreview(ctx, "proj-1", "xyznonexistent", 3);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.variant_generation_completed",
        affectedRecords: expect.objectContaining({
          requested: 3,
          generated: 0,
          excluded: 3,
        }),
      }),
    );
  });

  it("all variants share the same diff snapshot baseline", async () => {
    const variants = await generateVariantsWithPreview(ctx, "proj-1", "ticketing", 3);

    // All variants generated from same template should have same diff shape
    const addedCounts = variants.map((v) => v.diff.addedRecordTypes.length);
    expect(addedCounts.every((c) => c === addedCounts[0])).toBe(true);
  });
});

describe("createDraftFromVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
    mockTenantStorage.createVibeDraftVersion.mockResolvedValue({ id: "ver-mock", versionNumber: 1 });
  });

  it("creates a draft with version 1 reason='create_variant'", async () => {
    const pkg: GraphPackage = {
      packageKey: "vibe.test",
      version: "0.1.0",
      recordTypes: [{ key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }] }],
    };
    const checksum = computePackageChecksum(pkg);

    mockTenantStorage.createVibeDraft.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "draft-v1",
      tenantId: "t-1",
      ...data,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPreviewDiff: null,
      lastPreviewErrors: null,
    }));

    const draft = await createDraftFromVariant(ctx, "proj-1", null, pkg, "ticketing");

    expect(draft.id).toBe("draft-v1");
    expect(mockTenantStorage.createVibeDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        checksum,
        prompt: "ticketing",
      }),
    );
    expect(mockTenantStorage.createVibeDraftVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionNumber: 1,
        reason: "create_variant",
      }),
    );
  });

  it("emits vibe.draft_created_from_variant domain event", async () => {
    const pkg: GraphPackage = {
      packageKey: "vibe.test",
      version: "0.1.0",
      recordTypes: [{ key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }] }],
    };

    mockTenantStorage.createVibeDraft.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "draft-v2",
      tenantId: "t-1",
      ...data,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPreviewDiff: null,
      lastPreviewErrors: null,
    }));

    await createDraftFromVariant(ctx, "proj-1", null, pkg, "test");

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.draft_created_from_variant",
        status: "completed",
        entityId: "draft-v2",
      }),
    );
  });

  it("does not call generatePackageFromPrompt (uses package directly)", async () => {
    const pkg: GraphPackage = {
      packageKey: "vibe.test",
      version: "0.1.0",
      recordTypes: [{ key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }] }],
    };

    mockTenantStorage.createVibeDraft.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "draft-v3",
      tenantId: "t-1",
      ...data,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPreviewDiff: null,
      lastPreviewErrors: null,
    }));

    await createDraftFromVariant(ctx, "proj-1", null, pkg, "test");

    // Should NOT emit llm_generation events (those come from generatePackageFromPrompt)
    const emitCalls = (emitDomainEvent as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = emitCalls.map((c: unknown[]) => (c[1] as { type: string }).type);
    expect(eventTypes).not.toContain("vibe.llm_generation_requested");
  });
});
