import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { GraphPackage } from "../graph/installGraphService";
import { computePackageChecksum } from "../graph/installGraphService";

// --- Mocks ---

const mockTenantStorage = {
  getVibeDraft: vi.fn(),
  getVibeDraftVersion: vi.fn(),
  listRecordTypes: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import { diffDraftVersions, DraftVersionDiffError } from "../vibe/draftVersionDiffService";
import { emitDomainEvent } from "../services/domainEventService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function setupEmptyGraphMocks() {
  mockTenantStorage.listRecordTypes.mockResolvedValue([]);
  mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
  mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
}

const pkgV1: GraphPackage = {
  packageKey: "vibe.app_a",
  version: "0.1.0",
  recordTypes: [
    { key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }, { name: "priority", type: "string" }] },
    { key: "comment", name: "Comment", fields: [{ name: "body", type: "text" }] },
  ],
};

const pkgV2: GraphPackage = {
  packageKey: "vibe.app_a",
  version: "0.1.0",
  recordTypes: [
    { key: "ticket", name: "Ticket", fields: [{ name: "title", type: "string" }, { name: "status", type: "string" }] },
    { key: "attachment", name: "Attachment", fields: [{ name: "url", type: "string" }] },
  ],
};

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    tenantId: "t-1",
    projectId: "proj-1",
    environmentId: null,
    status: "draft",
    prompt: "ticketing",
    package: pkgV1 as unknown as Record<string, unknown>,
    checksum: computePackageChecksum(pkgV1),
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastPreviewDiff: null,
    lastPreviewErrors: null,
    ...overrides,
  };
}

function makeVersion(versionNumber: number, pkg: GraphPackage) {
  return {
    id: `ver-${versionNumber}`,
    tenantId: "t-1",
    draftId: "draft-1",
    versionNumber,
    createdAt: new Date(),
    createdBy: "user-1",
    reason: "create",
    package: pkg as unknown as Record<string, unknown>,
    checksum: computePackageChecksum(pkg),
    previewDiff: null,
    previewErrors: null,
  };
}

// --- Tests ---

describe("diffDraftVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("returns deterministic diff between two versions", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV2));

    const result = await diffDraftVersions(ctx, "draft-1", 1, 2);

    expect(result.diff).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(typeof result.summary.addedRecordTypes).toBe("number");
    expect(typeof result.summary.removedRecordTypes).toBe("number");
    expect(typeof result.summary.modifiedRecordTypes).toBe("number");
  });

  it("detects added/removed/modified record types", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV2));

    const result = await diffDraftVersions(ctx, "draft-1", 1, 2);

    // "attachment" added in v2
    const addedKeys = result.diff.addedRecordTypes.map((rt) => rt.key);
    expect(addedKeys).toContain("attachment");

    // "comment" removed from v2
    const removedKeys = result.diff.removedRecordTypes.map((rt) => rt.key);
    expect(removedKeys).toContain("comment");

    // "ticket" modified (field changes)
    const modified = result.diff.modifiedRecordTypes.find((m) => m.recordTypeKey === "ticket");
    expect(modified).toBeDefined();
  });

  it("summary matches diff counts", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV2));

    const result = await diffDraftVersions(ctx, "draft-1", 1, 2);

    expect(result.summary.addedRecordTypes).toBe(result.diff.addedRecordTypes.length);
    expect(result.summary.removedRecordTypes).toBe(result.diff.removedRecordTypes.length);
    expect(result.summary.modifiedRecordTypes).toBe(result.diff.modifiedRecordTypes.length);
  });

  it("identical versions produce empty diff", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV1));

    const result = await diffDraftVersions(ctx, "draft-1", 1, 2);

    expect(result.diff.addedRecordTypes).toHaveLength(0);
    expect(result.diff.removedRecordTypes).toHaveLength(0);
    expect(result.diff.modifiedRecordTypes).toHaveLength(0);
    expect(result.summary.addedRecordTypes).toBe(0);
    expect(result.summary.removedRecordTypes).toBe(0);
    expect(result.summary.modifiedRecordTypes).toBe(0);
  });

  it("emits vibe.draft_version_diff_computed event", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV2));

    await diffDraftVersions(ctx, "draft-1", 1, 2);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.draft_version_diff_computed",
        status: "completed",
        entityId: "draft-1",
        affectedRecords: expect.objectContaining({
          draftId: "draft-1",
          fromVersion: 1,
          toVersion: 2,
        }),
      }),
    );
  });

  it("returns 404 for non-existent draft", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(null);

    await expect(diffDraftVersions(ctx, "nonexistent", 1, 2)).rejects.toThrow(DraftVersionDiffError);
    await expect(diffDraftVersions(ctx, "nonexistent", 1, 2)).rejects.toThrow(/not found/);
  });

  it("returns 404 for non-existent fromVersion", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion.mockResolvedValueOnce(undefined);

    await expect(diffDraftVersions(ctx, "draft-1", 99, 2)).rejects.toThrow(DraftVersionDiffError);
    await expect(diffDraftVersions(ctx, "draft-1", 99, 2)).rejects.toThrow(/Version 99/);
  });

  it("returns 404 for non-existent toVersion", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft());
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(undefined);

    await expect(diffDraftVersions(ctx, "draft-1", 1, 99)).rejects.toThrow(DraftVersionDiffError);
    await expect(diffDraftVersions(ctx, "draft-1", 1, 99)).rejects.toThrow(/Version 99/);
  });

  it("works on installed drafts (read-only allowed)", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft({ status: "installed" }));
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV2));

    const result = await diffDraftVersions(ctx, "draft-1", 1, 2);

    expect(result.diff).toBeDefined();
    expect(result.summary.addedRecordTypes).toBeGreaterThan(0);
  });

  it("works on discarded drafts (read-only allowed)", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(makeDraft({ status: "discarded" }));
    mockTenantStorage.getVibeDraftVersion
      .mockResolvedValueOnce(makeVersion(1, pkgV1))
      .mockResolvedValueOnce(makeVersion(2, pkgV2));

    const result = await diffDraftVersions(ctx, "draft-1", 1, 2);

    expect(result.diff).toBeDefined();
  });
});
