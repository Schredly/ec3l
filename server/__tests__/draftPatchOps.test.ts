import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { VibePackageDraft } from "@shared/schema";
import type { GraphPackage } from "../graph/installGraphService";
import { computePackageChecksum } from "../graph/installGraphService";

// --- Mocks ---

const mockTenantStorage = {
  getVibeDraft: vi.fn(),
  updateVibeDraft: vi.fn(),
  createVibeDraftVersion: vi.fn(),
  getLatestVibeDraftVersionNumber: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import { applyPatchOpsToPackage, DraftPatchOpError, type DraftPatchOp } from "../vibe/draftPatchOps";
import { applyDraftPatchOps, VibeDraftError } from "../vibe/vibeDraftService";
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
      {
        key: "comment",
        name: "Comment",
        fields: [
          { name: "body", type: "text" },
          { name: "author", type: "string" },
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

// ============================================================
// Pure function tests
// ============================================================

describe("applyPatchOpsToPackage — pure", () => {
  it("add_field appends field to correct record type", () => {
    const pkg = makePackage();
    const result = applyPatchOpsToPackage(pkg, [
      { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
    ]);
    const ticketFields = result.recordTypes.find((r) => r.key === "ticket")!.fields;
    expect(ticketFields.map((f) => f.name)).toContain("priority");
    expect(ticketFields.length).toBe(4);
  });

  it("add_field throws on missing record type", () => {
    const pkg = makePackage();
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "add_field", recordTypeKey: "nonexistent", field: { name: "foo", type: "string" } },
      ]),
    ).toThrow(DraftPatchOpError);
  });

  it("add_field throws on duplicate field", () => {
    const pkg = makePackage();
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "title", type: "string" } },
      ]),
    ).toThrow(/already exists/);
  });

  it("rename_field renames existing field", () => {
    const pkg = makePackage();
    const result = applyPatchOpsToPackage(pkg, [
      { op: "rename_field", recordTypeKey: "ticket", from: "title", to: "summary" },
    ]);
    const fields = result.recordTypes.find((r) => r.key === "ticket")!.fields;
    expect(fields.map((f) => f.name)).toContain("summary");
    expect(fields.map((f) => f.name)).not.toContain("title");
  });

  it("rename_field throws on missing source field", () => {
    const pkg = makePackage();
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "rename_field", recordTypeKey: "ticket", from: "nonexistent", to: "foo" },
      ]),
    ).toThrow(/not found/);
  });

  it("rename_field throws when target name already exists", () => {
    const pkg = makePackage();
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "rename_field", recordTypeKey: "ticket", from: "title", to: "description" },
      ]),
    ).toThrow(/already exists/);
  });

  it("remove_field removes field", () => {
    const pkg = makePackage();
    const result = applyPatchOpsToPackage(pkg, [
      { op: "remove_field", recordTypeKey: "ticket", fieldName: "status" },
    ]);
    const fields = result.recordTypes.find((r) => r.key === "ticket")!.fields;
    expect(fields.map((f) => f.name)).not.toContain("status");
    expect(fields.length).toBe(2);
  });

  it("remove_field throws when removing last field", () => {
    const pkg: GraphPackage = {
      packageKey: "vibe.minimal",
      version: "0.1.0",
      recordTypes: [{ key: "single", name: "Single", fields: [{ name: "only", type: "string" }] }],
    };
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "remove_field", recordTypeKey: "single", fieldName: "only" },
      ]),
    ).toThrow(/Cannot remove last field/);
  });

  it("remove_field throws on missing field", () => {
    const pkg = makePackage();
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "remove_field", recordTypeKey: "ticket", fieldName: "nonexistent" },
      ]),
    ).toThrow(/not found/);
  });

  it("set_sla creates SLA policy", () => {
    const pkg = makePackage();
    const result = applyPatchOpsToPackage(pkg, [
      { op: "set_sla", recordTypeKey: "ticket", durationMinutes: 120 },
    ]);
    expect(result.slaPolicies).toEqual([{ recordTypeKey: "ticket", durationMinutes: 120 }]);
  });

  it("set_sla updates existing SLA policy", () => {
    const pkg = makePackage({ slaPolicies: [{ recordTypeKey: "ticket", durationMinutes: 60 }] });
    const result = applyPatchOpsToPackage(pkg, [
      { op: "set_sla", recordTypeKey: "ticket", durationMinutes: 240 },
    ]);
    expect(result.slaPolicies).toEqual([{ recordTypeKey: "ticket", durationMinutes: 240 }]);
  });

  it("set_sla throws for invalid duration", () => {
    const pkg = makePackage();
    expect(() =>
      applyPatchOpsToPackage(pkg, [
        { op: "set_sla", recordTypeKey: "ticket", durationMinutes: 0 },
      ]),
    ).toThrow(/greater than 0/);
  });

  it("set_assignment_group creates assignment rule", () => {
    const pkg = makePackage();
    const result = applyPatchOpsToPackage(pkg, [
      { op: "set_assignment_group", recordTypeKey: "ticket", groupKey: "support-team" },
    ]);
    expect(result.assignmentRules).toEqual([
      { recordTypeKey: "ticket", strategyType: "static_group", config: { groupKey: "support-team" } },
    ]);
  });

  it("set_assignment_group updates existing rule", () => {
    const pkg = makePackage({
      assignmentRules: [{ recordTypeKey: "ticket", strategyType: "round_robin", config: {} }],
    });
    const result = applyPatchOpsToPackage(pkg, [
      { op: "set_assignment_group", recordTypeKey: "ticket", groupKey: "eng-team" },
    ]);
    expect(result.assignmentRules![0]!.strategyType).toBe("static_group");
    expect(result.assignmentRules![0]!.config).toEqual({ groupKey: "eng-team" });
  });

  it("multiple ops apply sequentially", () => {
    const pkg = makePackage();
    const result = applyPatchOpsToPackage(pkg, [
      { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
      { op: "rename_field", recordTypeKey: "ticket", from: "title", to: "summary" },
      { op: "set_sla", recordTypeKey: "ticket", durationMinutes: 60 },
    ]);
    const fields = result.recordTypes.find((r) => r.key === "ticket")!.fields;
    expect(fields.map((f) => f.name)).toContain("priority");
    expect(fields.map((f) => f.name)).toContain("summary");
    expect(fields.map((f) => f.name)).not.toContain("title");
    expect(result.slaPolicies).toHaveLength(1);
  });

  it("does not mutate input package", () => {
    const pkg = makePackage();
    const originalJson = JSON.stringify(pkg);
    applyPatchOpsToPackage(pkg, [
      { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
    ]);
    expect(JSON.stringify(pkg)).toBe(originalJson);
  });
});

// ============================================================
// Service method tests
// ============================================================

describe("applyDraftPatchOps — service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
    mockTenantStorage.createVibeDraftVersion.mockResolvedValue({ id: "ver-mock", versionNumber: 1 });
  });

  it("applies ops, resets status to draft, updates checksum", async () => {
    const pkg = makePackage();
    const draft = makeDraftRow(pkg, { status: "previewed" });
    const beforeChecksum = draft.checksum;

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    const updated = await applyDraftPatchOps(ctx, draft.id, [
      { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
    ]);

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ status: "draft" }),
    );
    const updateCall = mockTenantStorage.updateVibeDraft.mock.calls[0]![1] as Record<string, unknown>;
    expect(updateCall.checksum).not.toBe(beforeChecksum);
  });

  it("rejects terminal draft (installed) with 409", async () => {
    const pkg = makePackage();
    const draft = makeDraftRow(pkg, { status: "installed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(
      applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "foo", type: "string" } },
      ]),
    ).rejects.toThrow(VibeDraftError);

    try {
      await applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "foo", type: "string" } },
      ]);
    } catch (err) {
      expect((err as VibeDraftError).statusCode).toBe(409);
    }
  });

  it("rejects terminal draft (discarded) with 409", async () => {
    const pkg = makePackage();
    const draft = makeDraftRow(pkg, { status: "discarded" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(
      applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "foo", type: "string" } },
      ]),
    ).rejects.toThrow(VibeDraftError);
  });

  it("emits vibe.draft_patched domain event", async () => {
    const pkg = makePackage();
    const draft = makeDraftRow(pkg);
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await applyDraftPatchOps(ctx, draft.id, [
      { op: "add_field", recordTypeKey: "ticket", field: { name: "priority", type: "choice" } },
    ]);

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "vibe.draft_patched",
        status: "completed",
        entityId: draft.id,
        affectedRecords: expect.objectContaining({ opCount: 1 }),
      }),
    );
  });

  it("cross-tenant isolation: returns 404 for other tenant's draft", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

    await expect(
      applyDraftPatchOps(ctx2, "draft-from-t1", [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "foo", type: "string" } },
      ]),
    ).rejects.toThrow(VibeDraftError);
    await expect(
      applyDraftPatchOps(ctx2, "draft-from-t1", [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "foo", type: "string" } },
      ]),
    ).rejects.toThrow(/not found/);
  });

  it("propagates DraftPatchOpError for invalid ops", async () => {
    const pkg = makePackage();
    const draft = makeDraftRow(pkg);
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(
      applyDraftPatchOps(ctx, draft.id, [
        { op: "add_field", recordTypeKey: "ticket", field: { name: "title", type: "string" } },
      ]),
    ).rejects.toThrow(DraftPatchOpError);
  });
});
