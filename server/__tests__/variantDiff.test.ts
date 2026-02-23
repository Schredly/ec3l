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

import { diffPackages } from "../vibe/variantDiffService";
import { adoptVariant, VibeDraftError } from "../vibe/vibeDraftService";
import { emitDomainEvent } from "../services/domainEventService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function setupEmptyGraphMocks() {
  mockTenantStorage.listRecordTypes.mockResolvedValue([]);
  mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
  mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
}

const pkgA: GraphPackage = {
  packageKey: "vibe.app_a",
  version: "0.1.0",
  recordTypes: [
    { key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }, { name: "priority", type: "string" }] },
    { key: "comment", name: "Comment", fields: [{ name: "body", type: "text" }] },
  ],
};

const pkgB: GraphPackage = {
  packageKey: "vibe.app_b",
  version: "0.1.0",
  recordTypes: [
    { key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }, { name: "status", type: "string" }] },
    { key: "attachment", name: "Attachment", fields: [{ name: "url", type: "string" }] },
  ],
};

// --- diffPackages tests ---

describe("diffPackages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("returns deterministic diff between two packages", async () => {
    const result = await diffPackages(ctx, "proj-1", pkgA, pkgB);

    expect(result.diff).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.addedRecordTypes).toBe("number");
    expect(typeof result.summary.removedRecordTypes).toBe("number");
    expect(typeof result.summary.modifiedRecordTypes).toBe("number");
  });

  it("detects added record types (in B but not A)", async () => {
    const result = await diffPackages(ctx, "proj-1", pkgA, pkgB);

    // "attachment" is in B but not A
    const addedKeys = result.diff.addedRecordTypes.map((rt) => rt.key);
    expect(addedKeys).toContain("attachment");
  });

  it("detects removed record types (in A but not B)", async () => {
    const result = await diffPackages(ctx, "proj-1", pkgA, pkgB);

    // "comment" is in A but not B
    const removedKeys = result.diff.removedRecordTypes.map((rt) => rt.key);
    expect(removedKeys).toContain("comment");
  });

  it("detects modified record types (field changes)", async () => {
    const result = await diffPackages(ctx, "proj-1", pkgA, pkgB);

    // "ticket" exists in both but has different fields
    const modified = result.diff.modifiedRecordTypes.find((m) => m.recordTypeKey === "ticket");
    expect(modified).toBeDefined();
    // "priority" is in A but not B → field removal
    expect(modified!.fieldRemovals).toContain("priority");
    // "status" is in B but not A → field addition
    expect(modified!.fieldAdds).toContain("status");
  });

  it("summary matches diff counts", async () => {
    const result = await diffPackages(ctx, "proj-1", pkgA, pkgB);

    expect(result.summary.addedRecordTypes).toBe(result.diff.addedRecordTypes.length);
    expect(result.summary.removedRecordTypes).toBe(result.diff.removedRecordTypes.length);
    expect(result.summary.modifiedRecordTypes).toBe(result.diff.modifiedRecordTypes.length);
  });

  it("emits vibe.variant_diff_computed event", async () => {
    await diffPackages(ctx, "proj-1", pkgA, pkgB);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.variant_diff_computed",
        status: "completed",
        affectedRecords: expect.objectContaining({
          packageKeyA: "vibe.app_a",
          packageKeyB: "vibe.app_b",
        }),
      }),
    );
  });

  it("identical packages produce empty diff", async () => {
    const result = await diffPackages(ctx, "proj-1", pkgA, pkgA);

    expect(result.diff.addedRecordTypes).toHaveLength(0);
    expect(result.diff.removedRecordTypes).toHaveLength(0);
    expect(result.diff.modifiedRecordTypes).toHaveLength(0);
    expect(result.summary.addedRecordTypes).toBe(0);
    expect(result.summary.removedRecordTypes).toBe(0);
    expect(result.summary.modifiedRecordTypes).toBe(0);
  });
});

// --- adoptVariant tests ---

describe("adoptVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(1);
    mockTenantStorage.createVibeDraftVersion.mockResolvedValue({ id: "ver-adopt", versionNumber: 2 });
  });

  function makeDraft(overrides: Record<string, unknown> = {}) {
    return {
      id: "draft-1",
      tenantId: "t-1",
      projectId: "proj-1",
      environmentId: null,
      status: "draft",
      prompt: "ticketing",
      package: pkgA as unknown as Record<string, unknown>,
      checksum: computePackageChecksum(pkgA),
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPreviewDiff: null,
      lastPreviewErrors: null,
      ...overrides,
    };
  }

  it("replaces package, resets status to draft, clears preview", async () => {
    const draft = makeDraft({ status: "previewed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...draft,
      ...data,
    }));

    const result = await adoptVariant(ctx, "draft-1", pkgB);

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      "draft-1",
      expect.objectContaining({
        package: pkgB as unknown as Record<string, unknown>,
        checksum: computePackageChecksum(pkgB),
        status: "draft",
        lastPreviewDiff: null,
        lastPreviewErrors: null,
      }),
    );
    expect(result.status).toBe("draft");
  });

  it("creates new version with reason=adopt_variant", async () => {
    const draft = makeDraft();
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...draft,
      ...data,
    }));

    await adoptVariant(ctx, "draft-1", pkgB);

    expect(mockTenantStorage.createVibeDraftVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        versionNumber: 2,
        reason: "adopt_variant",
      }),
    );
  });

  it("emits vibe.draft_variant_adopted event", async () => {
    const draft = makeDraft();
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...draft,
      ...data,
    }));

    await adoptVariant(ctx, "draft-1", pkgB);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.draft_variant_adopted",
        status: "completed",
        entityId: "draft-1",
        affectedRecords: expect.objectContaining({
          draftId: "draft-1",
          packageKey: "vibe.app_b",
          checksum: computePackageChecksum(pkgB),
          previousChecksum: draft.checksum,
        }),
      }),
    );
  });

  it("rejects installed draft with 409", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft({ status: "installed" }));

    await expect(adoptVariant(ctx, "draft-1", pkgB)).rejects.toThrow(VibeDraftError);
    await expect(adoptVariant(ctx, "draft-1", pkgB)).rejects.toThrow(/installed/);
  });

  it("rejects discarded draft with 409", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft({ status: "discarded" }));

    await expect(adoptVariant(ctx, "draft-1", pkgB)).rejects.toThrow(VibeDraftError);
    await expect(adoptVariant(ctx, "draft-1", pkgB)).rejects.toThrow(/discarded/);
  });

  it("returns 404 for non-existent draft", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(null);

    await expect(adoptVariant(ctx, "nonexistent", pkgB)).rejects.toThrow(VibeDraftError);
    await expect(adoptVariant(ctx, "nonexistent", pkgB)).rejects.toThrow(/not found/);
  });

  it("updates prompt when provided", async () => {
    const draft = makeDraft();
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...draft,
      ...data,
    }));

    await adoptVariant(ctx, "draft-1", pkgB, "new prompt");

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      "draft-1",
      expect.objectContaining({
        prompt: "new prompt",
      }),
    );
  });

  it("does not update prompt when not provided", async () => {
    const draft = makeDraft();
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...draft,
      ...data,
    }));

    await adoptVariant(ctx, "draft-1", pkgB);

    const updateCall = mockTenantStorage.updateVibeDraft.mock.calls[0]![1] as Record<string, unknown>;
    expect(updateCall).not.toHaveProperty("prompt");
  });
});
