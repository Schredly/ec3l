import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { VibePackageDraft, VibePackageDraftVersion } from "@shared/schema";
import type { GraphPackage } from "../graph/installGraphService";
import { computePackageChecksum } from "../graph/installGraphService";

// --- Mocks ---

const mockTenantStorage = {
  getVibeDraft: vi.fn(),
  updateVibeDraft: vi.fn(),
  createVibeDraft: vi.fn(),
  createVibeDraftVersion: vi.fn(),
  listVibeDraftVersions: vi.fn(),
  getVibeDraftVersion: vi.fn(),
  getLatestVibeDraftVersionNumber: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

vi.mock("../vibe/vibeService", () => ({
  generatePackageFromPrompt: vi.fn(async () => makePackage()),
  refinePackageFromPrompt: vi.fn(async (pkg: GraphPackage) => ({
    ...pkg,
    version: "0.2.0",
  })),
  previewVibePackage: vi.fn(),
  installVibePackage: vi.fn(),
}));

import {
  createDraftFromPrompt,
  refineDraft,
  applyDraftPatchOps,
  listDraftVersions,
  restoreDraftVersion,
  VibeDraftError,
} from "../vibe/vibeDraftService";
import { emitDomainEvent } from "../services/domainEventService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };
const ctx2: TenantContext = { tenantId: "t-2", userId: "user-2", source: "header" };

function makePackage(overrides: Partial<GraphPackage> = {}): GraphPackage {
  return {
    packageKey: "vibe.test",
    version: "0.1.0",
    recordTypes: [
      {
        key: "ticket",
        name: "Ticket",
        fields: [
          { name: "title", type: "string" },
          { name: "description", type: "text" },
          { name: "status", type: "choice" },
        ],
      },
    ],
    ...overrides,
  };
}

let draftCounter = 0;
function makeDraftRow(pkg: GraphPackage, overrides: Partial<VibePackageDraft> = {}): VibePackageDraft {
  draftCounter++;
  return {
    id: `draft-${draftCounter}`,
    tenantId: "t-1",
    projectId: "proj-1",
    environmentId: null,
    status: "draft",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    prompt: "test",
    package: pkg as unknown as Record<string, unknown>,
    checksum: computePackageChecksum(pkg),
    lastPreviewDiff: null,
    lastPreviewErrors: null,
    ...overrides,
  };
}

let versionCounter = 0;
function makeVersionRow(
  draft: VibePackageDraft,
  versionNumber: number,
  reason: string,
): VibePackageDraftVersion {
  versionCounter++;
  return {
    id: `ver-${versionCounter}`,
    tenantId: draft.tenantId,
    draftId: draft.id,
    versionNumber,
    createdAt: new Date(),
    createdBy: draft.createdBy,
    reason,
    package: draft.package,
    checksum: draft.checksum,
    previewDiff: draft.lastPreviewDiff,
    previewErrors: draft.lastPreviewErrors,
  };
}

describe("Draft Versioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    draftCounter = 0;
    versionCounter = 0;
  });

  describe("version creation on mutations", () => {
    it("createDraftFromPrompt creates a version snapshot", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);

      mockTenantStorage.createVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await createDraftFromPrompt(ctx, "proj-1", null, "test prompt");

      expect(mockTenantStorage.createVibeDraftVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: draft.id,
          versionNumber: 1,
          reason: "create",
        }),
      );
    });

    it("refineDraft creates a version snapshot", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(1);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await refineDraft(ctx, draft.id, "add a priority field");

      expect(mockTenantStorage.createVibeDraftVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: draft.id,
          versionNumber: 2,
          reason: "refine",
        }),
      );
    });

    it("applyDraftPatchOps creates a version snapshot", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(2);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
      ]);

      expect(mockTenantStorage.createVibeDraftVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: draft.id,
          versionNumber: 3,
          reason: "patch",
        }),
      );
    });

    it("version numbers are monotonically increasing per draft", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);
      let latestVersion = 0;

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockImplementation(async () => latestVersion);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => {
          latestVersion = data.versionNumber as number;
          return makeVersionRow(draft, latestVersion, data.reason as string);
        },
      );

      // First patch -> v1
      await applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
      ]);
      expect(latestVersion).toBe(1);

      // Second patch -> v2
      await applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "severity", type: "choice" } },
      ]);
      expect(latestVersion).toBe(2);
    });

    it("emits vibe.draft_version_created domain event", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
      ]);

      expect(emitDomainEvent).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          type: "vibe.draft_version_created",
          status: "completed",
          entityId: draft.id,
          affectedRecords: expect.objectContaining({
            versionNumber: 1,
            reason: "patch",
          }),
        }),
      );
    });
  });

  describe("listDraftVersions", () => {
    it("returns versions for a valid draft", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);
      const versions = [
        makeVersionRow(draft, 2, "patch"),
        makeVersionRow(draft, 1, "create"),
      ];

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.listVibeDraftVersions.mockResolvedValue(versions);

      const result = await listDraftVersions(ctx, draft.id);

      expect(result).toHaveLength(2);
      expect(result[0]!.versionNumber).toBe(2);
    });

    it("throws 404 for non-existent draft", async () => {
      mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

      await expect(listDraftVersions(ctx, "nonexistent")).rejects.toThrow(VibeDraftError);
      await expect(listDraftVersions(ctx, "nonexistent")).rejects.toThrow(/not found/);
    });
  });

  describe("restoreDraftVersion", () => {
    it("restores draft to a previous version", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg, { status: "previewed" });
      const oldPkg = makePackage({ version: "0.0.1" });
      const version = makeVersionRow(
        { ...draft, package: oldPkg as unknown as Record<string, unknown>, checksum: computePackageChecksum(oldPkg) },
        1,
        "create",
      );

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.getVibeDraftVersion.mockResolvedValue(version);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(2);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await restoreDraftVersion(ctx, draft.id, 1);

      expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
        draft.id,
        expect.objectContaining({
          package: version.package,
          checksum: version.checksum,
          status: "draft",
        }),
      );
    });

    it("creates a version snapshot with reason 'restore'", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);
      const version = makeVersionRow(draft, 1, "create");

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.getVibeDraftVersion.mockResolvedValue(version);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(2);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await restoreDraftVersion(ctx, draft.id, 1);

      expect(mockTenantStorage.createVibeDraftVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 3,
          reason: "restore",
        }),
      );
    });

    it("resets status to draft on restore", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg, { status: "previewed" });
      const version = makeVersionRow(draft, 1, "create");

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.getVibeDraftVersion.mockResolvedValue(version);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(1);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await restoreDraftVersion(ctx, draft.id, 1);

      expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
        draft.id,
        expect.objectContaining({ status: "draft" }),
      );
    });

    it("emits vibe.draft_restored domain event", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);
      const version = makeVersionRow(draft, 1, "create");

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.getVibeDraftVersion.mockResolvedValue(version);
      mockTenantStorage.updateVibeDraft.mockImplementation(
        async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
      );
      mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(1);
      mockTenantStorage.createVibeDraftVersion.mockImplementation(
        async (data: Record<string, unknown>) => makeVersionRow(draft, data.versionNumber as number, data.reason as string),
      );

      await restoreDraftVersion(ctx, draft.id, 1);

      expect(emitDomainEvent).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          type: "vibe.draft_restored",
          status: "completed",
          entityId: draft.id,
          affectedRecords: expect.objectContaining({
            restoredVersionNumber: 1,
          }),
        }),
      );
    });

    it("cannot restore an installed draft (409)", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg, { status: "installed" });

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

      await expect(restoreDraftVersion(ctx, draft.id, 1)).rejects.toThrow(VibeDraftError);

      try {
        await restoreDraftVersion(ctx, draft.id, 1);
      } catch (err) {
        expect((err as VibeDraftError).statusCode).toBe(409);
      }
    });

    it("cannot restore a discarded draft (409)", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg, { status: "discarded" });

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

      await expect(restoreDraftVersion(ctx, draft.id, 1)).rejects.toThrow(VibeDraftError);
    });

    it("returns 404 for non-existent version", async () => {
      const pkg = makePackage();
      const draft = makeDraftRow(pkg);

      mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
      mockTenantStorage.getVibeDraftVersion.mockResolvedValue(undefined);

      await expect(restoreDraftVersion(ctx, draft.id, 999)).rejects.toThrow(/not found/);
    });

    it("cross-tenant isolation: returns 404 for other tenant's draft", async () => {
      mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

      await expect(
        restoreDraftVersion(ctx2, "draft-from-t1", 1),
      ).rejects.toThrow(VibeDraftError);
      await expect(
        restoreDraftVersion(ctx2, "draft-from-t1", 1),
      ).rejects.toThrow(/not found/);
    });
  });
});
