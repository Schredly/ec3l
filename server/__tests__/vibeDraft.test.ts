import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { VibePackageDraft, RecordType } from "@shared/schema";

// --- Mocks ---

const mockTenantStorage = {
  // Draft CRUD
  createVibeDraft: vi.fn(),
  getVibeDraft: vi.fn(),
  updateVibeDraft: vi.fn(),
  listVibeDrafts: vi.fn(),
  // Graph snapshot dependencies
  listRecordTypes: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  // Install engine dependencies
  getRecordTypeByKey: vi.fn(),
  getProject: vi.fn(),
  createRecordType: vi.fn(),
  updateRecordTypeSchema: vi.fn(),
  updateRecordTypeSlaConfig: vi.fn(),
  updateRecordTypeAssignmentConfig: vi.fn(),
  createWorkflowDefinition: vi.fn(),
  createWorkflowTrigger: vi.fn(),
  createWorkflowStep: vi.fn(),
  updateWorkflowDefinitionStatus: vi.fn(),
  getLatestGraphPackageInstall: vi.fn(),
  createGraphPackageInstall: vi.fn(),
  listGraphPackageInstalls: vi.fn(),
  createEnvironmentPackageInstall: vi.fn(),
  // Version history
  createVibeDraftVersion: vi.fn().mockResolvedValue({ id: "ver-mock", versionNumber: 1 }),
  getLatestVibeDraftVersionNumber: vi.fn().mockResolvedValue(0),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import {
  createDraftFromPrompt,
  refineDraft,
  previewDraft,
  installDraft,
  VibeDraftError,
} from "../vibe/vibeDraftService";
import { computePackageChecksum } from "../graph/installGraphService";
import type { GraphPackage } from "../graph/installGraphService";
import { emitDomainEvent } from "../services/domainEventService";
import { simpleTicketingAppTemplate } from "../vibe/vibeTemplates";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };
const ctx2: TenantContext = { tenantId: "t-2", userId: "user-2", source: "header" };

let draftIdCounter = 0;

function makeDraftRow(pkg: GraphPackage, overrides: Partial<VibePackageDraft> = {}): VibePackageDraft {
  draftIdCounter++;
  return {
    id: `draft-${draftIdCounter}`,
    tenantId: "t-1",
    projectId: "proj-1",
    environmentId: "env-dev",
    status: "draft",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    prompt: "ticketing",
    package: pkg as unknown as Record<string, unknown>,
    checksum: computePackageChecksum(pkg),
    lastPreviewDiff: null,
    lastPreviewErrors: null,
    ...overrides,
  };
}

function setupEmptyGraphMocks() {
  mockTenantStorage.listRecordTypes.mockResolvedValue([]);
  mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
  mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
  mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);
  mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
  mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
}

function setupDynamicCreateMock() {
  const createdTypes = new Map<string, RecordType>();
  mockTenantStorage.getRecordTypeByKey.mockImplementation(async (key: string) => {
    return createdTypes.get(key) ?? undefined;
  });
  mockTenantStorage.createRecordType.mockImplementation(async (data: Record<string, unknown>) => {
    const rt = {
      ...data,
      id: `rt-${data.key}`,
      description: data.description ?? null,
      assignmentConfig: null,
      slaConfig: null,
      status: "draft",
      version: 1,
      createdAt: new Date(),
    };
    createdTypes.set(data.key as string, rt as RecordType);
    return rt;
  });
  mockTenantStorage.listRecordTypes.mockImplementation(async () => {
    return Array.from(createdTypes.values());
  });
  return createdTypes;
}

// --- createDraftFromPrompt ---

describe("createDraftFromPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
    mockTenantStorage.createVibeDraftVersion.mockResolvedValue({ id: "ver-mock", versionNumber: 1 });
  });

  it("creates a draft row with package and checksum", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const checksum = computePackageChecksum(pkg);

    mockTenantStorage.createVibeDraft.mockImplementation(async (data: Record<string, unknown>) => {
      return {
        id: "draft-new",
        tenantId: "t-1",
        ...data,
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastPreviewDiff: null,
        lastPreviewErrors: null,
      };
    });

    const draft = await createDraftFromPrompt(ctx, "proj-1", "env-dev", "ticketing");

    expect(mockTenantStorage.createVibeDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        environmentId: "env-dev",
        prompt: "ticketing",
        checksum,
      }),
    );
    expect(draft.id).toBe("draft-new");
  });

  it("emits vibe.draft_created domain event", async () => {
    mockTenantStorage.createVibeDraft.mockResolvedValue(
      makeDraftRow(structuredClone(simpleTicketingAppTemplate)),
    );

    await createDraftFromPrompt(ctx, "proj-1", "env-dev", "ticketing");

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.draft_created",
      status: "completed",
    }));
  });

  it("stores createdBy from context userId", async () => {
    mockTenantStorage.createVibeDraft.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "draft-x",
      tenantId: "t-1",
      ...data,
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastPreviewDiff: null,
      lastPreviewErrors: null,
    }));

    await createDraftFromPrompt(ctx, "proj-1", null, "ticketing");

    expect(mockTenantStorage.createVibeDraft).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: "user-1" }),
    );
  });
});

// --- refineDraft ---

describe("refineDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
    mockTenantStorage.createVibeDraftVersion.mockResolvedValue({ id: "ver-mock", versionNumber: 1 });
  });

  it("updates package and checksum after refinement", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);
    const beforeChecksum = draft.checksum;

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    const updated = await refineDraft(ctx, draft.id, "add field urgency to ticket");

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        prompt: "add field urgency to ticket",
        status: "draft",
      }),
    );
    // Checksum should change
    const updateCall = mockTenantStorage.updateVibeDraft.mock.calls[0]![1] as Record<string, unknown>;
    expect(updateCall.checksum).not.toBe(beforeChecksum);
  });

  it("resets status to draft if previously previewed", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "previewed" });

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await refineDraft(ctx, draft.id, "add field urgency to ticket");

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ status: "draft" }),
    );
  });

  it("throws for installed draft", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "installed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(refineDraft(ctx, draft.id, "add field x to ticket")).rejects.toThrow(VibeDraftError);
  });

  it("throws for discarded draft", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "discarded" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(refineDraft(ctx, draft.id, "add field x to ticket")).rejects.toThrow(VibeDraftError);
  });

  it("throws for nonexistent draft", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

    await expect(refineDraft(ctx, "nope", "add field x to ticket")).rejects.toThrow(VibeDraftError);
  });

  it("emits vibe.draft_refined domain event", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await refineDraft(ctx, draft.id, "add field urgency to ticket");

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.draft_refined",
    }));
  });
});

// --- previewDraft ---

describe("previewDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("stores diff and errors in draft row", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    const result = await previewDraft(ctx, draft.id);

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({
        status: "previewed",
      }),
    );
    // Should have stored diff
    const updateCall = mockTenantStorage.updateVibeDraft.mock.calls[0]![1] as Record<string, unknown>;
    expect(updateCall.lastPreviewDiff).toBeDefined();
    expect(updateCall.lastPreviewErrors).toBeDefined();
  });

  it("transitions status to previewed", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await previewDraft(ctx, draft.id);

    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ status: "previewed" }),
    );
  });

  it("emits vibe.draft_previewed domain event", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await previewDraft(ctx, draft.id);

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.draft_previewed",
    }));
  });

  it("rejects installed draft", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "installed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(previewDraft(ctx, draft.id)).rejects.toThrow(VibeDraftError);
  });
});

// --- installDraft ---

describe("installDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
    setupDynamicCreateMock();
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1", name: "Test" });
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({});
    mockTenantStorage.createEnvironmentPackageInstall.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "trig-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "step-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("calls install engine and sets status to installed", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    const result = await installDraft(ctx, draft.id);

    expect(result.installResult.installResult.success).toBe(true);
    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ status: "installed" }),
    );
  });

  it("writes audit trail via createGraphPackageInstall", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await installDraft(ctx, draft.id);

    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        packageKey: pkg.packageKey,
        projectId: "proj-1",
      }),
    );
  });

  it("writes env ledger when draft has environmentId", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { environmentId: "env-dev" });

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await installDraft(ctx, draft.id);

    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: "env-dev",
        source: "install",
      }),
    );
  });

  it("emits vibe.draft_installed domain event", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);

    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await installDraft(ctx, draft.id);

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.draft_installed",
    }));
  });

  it("rejects already-installed draft", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "installed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(installDraft(ctx, draft.id)).rejects.toThrow(VibeDraftError);
  });

  it("rejects discarded draft", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "discarded" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(installDraft(ctx, draft.id)).rejects.toThrow(VibeDraftError);
  });
});

// --- Cross-tenant isolation ---

describe("cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cannot access draft from another tenant context", async () => {
    // getVibeDraft filters by tenantId; for t-2 it returns undefined
    mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

    await expect(refineDraft(ctx2, "draft-from-t1", "add field x to ticket"))
      .rejects.toThrow(VibeDraftError);
    await expect(refineDraft(ctx2, "draft-from-t1", "add field x to ticket"))
      .rejects.toThrow(/not found/);
  });

  it("preview rejects nonexistent draft (tenant isolation)", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

    await expect(previewDraft(ctx2, "draft-from-t1")).rejects.toThrow(VibeDraftError);
  });

  it("install rejects nonexistent draft (tenant isolation)", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);

    await expect(installDraft(ctx2, "draft-from-t1")).rejects.toThrow(VibeDraftError);
  });
});

// --- Draft lifecycle (compound) ---

describe("draft lifecycle — create → refine → preview → install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
    setupDynamicCreateMock();
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1", name: "Test" });
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({});
    mockTenantStorage.createEnvironmentPackageInstall.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "trig-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "step-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
    mockTenantStorage.getLatestVibeDraftVersionNumber.mockResolvedValue(0);
    mockTenantStorage.createVibeDraftVersion.mockResolvedValue({ id: "ver-mock", versionNumber: 1 });
  });

  it("full lifecycle: create → refine → preview → install", async () => {
    // 1. Create draft
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const checksum1 = computePackageChecksum(pkg);
    let currentDraft = makeDraftRow(pkg, { id: "draft-lifecycle" });

    mockTenantStorage.createVibeDraft.mockResolvedValue(currentDraft);
    const created = await createDraftFromPrompt(ctx, "proj-1", "env-dev", "ticketing");
    expect(created.checksum).toBe(checksum1);

    // 2. Refine
    mockTenantStorage.getVibeDraft.mockResolvedValue(currentDraft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => {
        currentDraft = { ...currentDraft, ...updates } as VibePackageDraft;
        return currentDraft;
      },
    );

    const refined = await refineDraft(ctx, "draft-lifecycle", "add field urgency to ticket");
    expect(refined.checksum).not.toBe(checksum1);

    // 3. Preview
    mockTenantStorage.getVibeDraft.mockResolvedValue(currentDraft);
    const previewed = await previewDraft(ctx, "draft-lifecycle");
    expect(previewed.status).toBe("previewed");

    // 4. Install
    mockTenantStorage.getVibeDraft.mockResolvedValue(currentDraft);
    // Re-setup mocks cleared by preview
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);

    const installed = await installDraft(ctx, "draft-lifecycle");
    expect(installed.draft.status).toBe("installed");
    expect(installed.installResult.installResult.success).toBe(true);

    // Verify all 4 domain events fired
    const eventCalls = (emitDomainEvent as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = eventCalls.map((c: unknown[]) => (c[1] as { type: string }).type);
    expect(eventTypes).toContain("vibe.draft_created");
    expect(eventTypes).toContain("vibe.draft_refined");
    expect(eventTypes).toContain("vibe.draft_previewed");
    expect(eventTypes).toContain("vibe.draft_installed");
  });
});
