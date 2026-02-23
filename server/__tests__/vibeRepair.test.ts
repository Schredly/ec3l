import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { VibePackageDraft } from "@shared/schema";

// --- Mocks ---

const mockTenantStorage = {
  listRecordTypes: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  getLatestGraphPackageInstall: vi.fn(),
  listGraphPackageInstalls: vi.fn(),
  createVibeDraft: vi.fn(),
  getVibeDraft: vi.fn(),
  updateVibeDraft: vi.fn(),
  listVibeDrafts: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

// Mock the LLM adapter at module level so we can control it per test
// vi.hoisted ensures the mock object exists before vi.mock hoisting runs,
// which matters because vibeService.ts calls createLlmAdapter() at import time.
const mockAdapter = vi.hoisted(() => ({
  generateGraphPackage: vi.fn(),
  repairGraphPackage: vi.fn(),
  refineGraphPackage: vi.fn(),
}));

vi.mock("../vibe/llmAdapter", () => ({
  createLlmAdapter: () => mockAdapter,
}));

import { generateAndPreviewWithRepair, generateAndPreviewWithRepairStreaming } from "../vibe/repairService";
import type { StreamStageEvent } from "../vibe/repairService";
import { generatePackageFromPrompt, refinePackageFromPrompt, VibeServiceError } from "../vibe/vibeService";
import { discardDraft, VibeDraftError } from "../vibe/vibeDraftService";
import { computePackageChecksum } from "../graph/installGraphService";
import type { GraphPackage } from "../graph/installGraphService";
import { emitDomainEvent } from "../services/domainEventService";
import { simpleTicketingAppTemplate } from "../vibe/vibeTemplates";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function setupEmptyGraphMocks() {
  mockTenantStorage.listRecordTypes.mockResolvedValue([]);
  mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
  mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
  mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);
  mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
  mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
}

function makeValidPackage(overrides?: Partial<GraphPackage>): GraphPackage {
  return {
    packageKey: "vibe.test_app",
    version: "0.1.0",
    recordTypes: [
      {
        key: "test_item",
        name: "Test Item",
        fields: [
          { name: "title", type: "string", required: true },
          { name: "status", type: "choice", required: true },
        ],
      },
    ],
    ...overrides,
  };
}

function makeDraftRow(pkg: GraphPackage, overrides: Partial<VibePackageDraft> = {}): VibePackageDraft {
  return {
    id: "draft-1",
    tenantId: "t-1",
    projectId: "proj-1",
    environmentId: "env-dev",
    status: "draft",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    prompt: "test app",
    package: pkg as unknown as Record<string, unknown>,
    checksum: computePackageChecksum(pkg),
    lastPreviewDiff: null,
    lastPreviewErrors: null,
    ...overrides,
  };
}

// --- Adapter factory selection ---

describe("createLlmAdapter — factory selection", () => {
  // We test the factory through env var behavior.
  // Since we mock createLlmAdapter globally, this tests the stub fallback behavior.

  it("stub adapter returns template for matching prompt", async () => {
    // Use the real generatePackageFromPrompt which uses our mock adapter
    mockAdapter.generateGraphPackage.mockResolvedValue(
      structuredClone(simpleTicketingAppTemplate) as unknown,
    );
    const pkg = await generatePackageFromPrompt("ticketing");
    expect(pkg.packageKey).toMatch(/^vibe\./);
    expect(pkg.recordTypes.length).toBeGreaterThan(0);
  });

  it("adapter returns null for unrecognized prompt", async () => {
    mockAdapter.generateGraphPackage.mockResolvedValue(null);
    await expect(generatePackageFromPrompt("quantum simulator")).rejects.toThrow(VibeServiceError);
  });
});

// --- Repair loop ---

describe("generateAndPreviewWithRepair — repair loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("succeeds on first attempt with valid output", async () => {
    const validPkg = makeValidPackage();
    mockAdapter.generateGraphPackage.mockResolvedValue(validPkg as unknown);

    const result = await generateAndPreviewWithRepair(ctx, "proj-1", "a test app");

    expect(result.success).toBe(true);
    expect(result.package).not.toBeNull();
    expect(result.package!.packageKey).toBe("vibe.test_app");
    expect(result.attempts).toBe(1);
    expect(result.schemaErrors).toBeNull();
    expect(result.diff).not.toBeNull();
  });

  it("repairs on second attempt after schema failure", async () => {
    // First attempt: invalid (missing recordTypes)
    mockAdapter.generateGraphPackage.mockResolvedValue({
      packageKey: "vibe.broken",
      version: "0.1.0",
      // Missing recordTypes — will fail Zod validation
    } as unknown);

    // Second attempt (repair): valid
    const validPkg = makeValidPackage();
    mockAdapter.repairGraphPackage.mockResolvedValue(validPkg as unknown);

    const result = await generateAndPreviewWithRepair(ctx, "proj-1", "a test app", {
      maxAttempts: 2,
    });

    expect(result.success).toBe(true);
    expect(result.package).not.toBeNull();
    expect(result.attempts).toBe(2);
    expect(result.schemaErrors).toBeNull();
  });

  it("returns 422 details when all attempts fail schema validation", async () => {
    // Both attempts produce invalid output
    mockAdapter.generateGraphPackage.mockResolvedValue({
      packageKey: "vibe.broken",
      version: "0.1.0",
    } as unknown);
    mockAdapter.repairGraphPackage.mockResolvedValue({
      packageKey: "vibe.still_broken",
      version: "0.1.0",
    } as unknown);

    const result = await generateAndPreviewWithRepair(ctx, "proj-1", "a test app", {
      maxAttempts: 2,
    });

    expect(result.success).toBe(false);
    expect(result.package).toBeNull();
    expect(result.schemaErrors).toContain("INVALID_GENERATED_PACKAGE");
    expect(result.attempts).toBe(2);
  });

  it("returns validation errors from preview pipeline without auto-fixing", async () => {
    // Valid schema but will have graph validation issues (orphan baseType)
    const pkg = makeValidPackage({
      recordTypes: [
        {
          key: "child_type",
          name: "Child",
          baseType: "nonexistent_parent",
          fields: [{ name: "x", type: "string" }],
        },
      ],
    });
    mockAdapter.generateGraphPackage.mockResolvedValue(pkg as unknown);

    const result = await generateAndPreviewWithRepair(ctx, "proj-1", "orphan test");

    // Package was generated and previewed, but has validation errors
    expect(result.package).not.toBeNull();
    expect(result.diff).not.toBeNull();
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.success).toBe(false); // valid === false due to validation errors
  });

  it("repair attempt emits vibe.llm_repair_attempted event", async () => {
    // First attempt: invalid
    mockAdapter.generateGraphPackage.mockResolvedValue({
      packageKey: "vibe.broken",
      version: "0.1.0",
    } as unknown);

    // Repair: valid
    const validPkg = makeValidPackage();
    mockAdapter.repairGraphPackage.mockResolvedValue(validPkg as unknown);

    await generateAndPreviewWithRepair(ctx, "proj-1", "a test app", { maxAttempts: 2 });

    const calls = (emitDomainEvent as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = calls.map((c: unknown[]) => (c[1] as { type: string }).type);
    expect(eventTypes).toContain("vibe.llm_repair_attempted");
  });

  it("does not retry on non-schema errors (e.g., no match)", async () => {
    mockAdapter.generateGraphPackage.mockResolvedValue(null);

    await expect(
      generateAndPreviewWithRepair(ctx, "proj-1", "quantum computer", { maxAttempts: 3 }),
    ).rejects.toThrow(VibeServiceError);

    // repairGraphPackage should NOT have been called
    expect(mockAdapter.repairGraphPackage).not.toHaveBeenCalled();
  });

  it("never calls install", async () => {
    const validPkg = makeValidPackage();
    mockAdapter.generateGraphPackage.mockResolvedValue(validPkg as unknown);

    await generateAndPreviewWithRepair(ctx, "proj-1", "test");

    // No install-related storage calls
    expect(mockTenantStorage.getRecordTypeByKey).not.toHaveBeenCalled();
  });

  it("appName overrides packageKey", async () => {
    const validPkg = makeValidPackage();
    mockAdapter.generateGraphPackage.mockResolvedValue(validPkg as unknown);

    const result = await generateAndPreviewWithRepair(ctx, "proj-1", "test", {
      appName: "My Custom",
    });

    expect(result.package!.packageKey).toBe("vibe.my_custom");
  });
});

// --- Draft discard ---

describe("discardDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions draft status to discarded", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    const result = await discardDraft(ctx, draft.id);
    expect(result.status).toBe("discarded");
    expect(mockTenantStorage.updateVibeDraft).toHaveBeenCalledWith(
      draft.id,
      expect.objectContaining({ status: "discarded" }),
    );
  });

  it("emits vibe.draft_discarded domain event", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg);
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    await discardDraft(ctx, draft.id);

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.draft_discarded",
      status: "completed",
    }));
  });

  it("cannot discard installed draft", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "installed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    await expect(discardDraft(ctx, draft.id)).rejects.toThrow(VibeDraftError);
  });

  it("idempotent — discarding already-discarded draft returns it", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "discarded" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);

    const result = await discardDraft(ctx, draft.id);
    expect(result.status).toBe("discarded");
    // Should NOT call updateVibeDraft for already-discarded
    expect(mockTenantStorage.updateVibeDraft).not.toHaveBeenCalled();
  });

  it("can discard from previewed status", async () => {
    const pkg = structuredClone(simpleTicketingAppTemplate);
    const draft = makeDraftRow(pkg, { status: "previewed" });
    mockTenantStorage.getVibeDraft.mockResolvedValue(draft);
    mockTenantStorage.updateVibeDraft.mockImplementation(
      async (_id: string, updates: Record<string, unknown>) => ({ ...draft, ...updates }),
    );

    const result = await discardDraft(ctx, draft.id);
    expect(result.status).toBe("discarded");
  });

  it("throws for nonexistent draft (cross-tenant isolation)", async () => {
    mockTenantStorage.getVibeDraft.mockResolvedValue(undefined);
    const ctx2: TenantContext = { tenantId: "t-2", userId: "user-2", source: "header" };

    await expect(discardDraft(ctx2, "draft-from-t1")).rejects.toThrow(VibeDraftError);
  });
});

// --- LLM refinement ---

describe("refinePackageFromPrompt — LLM path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses LLM when adapter returns valid package", async () => {
    const basePkg = makeValidPackage();
    const llmRefined = makeValidPackage({
      recordTypes: [
        {
          key: "test_item",
          name: "Test Item",
          fields: [
            { name: "title", type: "string", required: true },
            { name: "status", type: "choice", required: true },
            { name: "priority", type: "string" },
          ],
        },
      ],
    });
    mockAdapter.refineGraphPackage.mockResolvedValue(llmRefined as unknown);

    const result = await refinePackageFromPrompt(basePkg, "add a priority field", ctx);
    expect(result.recordTypes[0]!.fields.length).toBe(3);
    expect(mockAdapter.refineGraphPackage).toHaveBeenCalledTimes(1);
  });

  it("falls back to deterministic when LLM returns null", async () => {
    const basePkg = makeValidPackage();
    mockAdapter.refineGraphPackage.mockResolvedValue(null);

    const result = await refinePackageFromPrompt(basePkg, "add field priority to test_item");
    expect(result.recordTypes[0]!.fields.map((f) => f.name)).toContain("priority");
    expect(mockAdapter.refineGraphPackage).toHaveBeenCalledTimes(1);
  });

  it("falls back to deterministic when LLM returns invalid schema", async () => {
    const basePkg = makeValidPackage();
    // LLM returns invalid (missing recordTypes)
    mockAdapter.refineGraphPackage.mockResolvedValue({
      packageKey: "vibe.broken",
      version: "0.1.0",
    } as unknown);

    const result = await refinePackageFromPrompt(basePkg, "add field priority to test_item");
    expect(result.recordTypes[0]!.fields.map((f) => f.name)).toContain("priority");
  });

  it("emits refinement telemetry events on LLM success", async () => {
    const basePkg = makeValidPackage();
    const llmRefined = makeValidPackage();
    mockAdapter.refineGraphPackage.mockResolvedValue(llmRefined as unknown);

    await refinePackageFromPrompt(basePkg, "tweak it", ctx);

    const calls = (emitDomainEvent as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = calls.map((c: unknown[]) => (c[1] as { type: string }).type);
    expect(eventTypes).toContain("vibe.llm_refinement_requested");
    expect(eventTypes).toContain("vibe.llm_refinement_succeeded");
  });

  it("emits refinement failed event and falls back on LLM error", async () => {
    const basePkg = makeValidPackage();
    mockAdapter.refineGraphPackage.mockRejectedValue(new Error("API down"));

    // Falls back to deterministic — this should throw since "tweak it" is not parsable
    await expect(refinePackageFromPrompt(basePkg, "tweak it", ctx)).rejects.toThrow(VibeServiceError);

    const calls = (emitDomainEvent as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = calls.map((c: unknown[]) => (c[1] as { type: string }).type);
    expect(eventTypes).toContain("vibe.llm_refinement_requested");
    expect(eventTypes).toContain("vibe.llm_refinement_failed");
  });

  it("rejects LLM refinement with reserved namespace", async () => {
    const basePkg = makeValidPackage();
    const badPkg = makeValidPackage({ packageKey: "hr.stolen" });
    mockAdapter.refineGraphPackage.mockResolvedValue(badPkg as unknown);

    // Should fall back to deterministic since namespace guard fires
    const result = await refinePackageFromPrompt(basePkg, "add field x to test_item");
    expect(result.packageKey).toBe("vibe.test_app"); // original key preserved
  });
});

// --- Streaming preview ---

describe("generateAndPreviewWithRepairStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("emits stage events in correct order on success", async () => {
    const validPkg = makeValidPackage();
    mockAdapter.generateGraphPackage.mockResolvedValue(validPkg as unknown);

    const stages: StreamStageEvent["stage"][] = [];
    await generateAndPreviewWithRepairStreaming(
      ctx, "proj-1", "a test app",
      (event) => stages.push(event.stage),
    );

    expect(stages).toEqual(["generation", "validation", "projection", "diff", "complete"]);
  });

  it("emits repair stage on schema failure + repair", async () => {
    // First attempt: invalid
    mockAdapter.generateGraphPackage.mockResolvedValue({
      packageKey: "vibe.broken",
      version: "0.1.0",
    } as unknown);

    // Repair: valid
    const validPkg = makeValidPackage();
    mockAdapter.repairGraphPackage.mockResolvedValue(validPkg as unknown);

    const stages: StreamStageEvent["stage"][] = [];
    await generateAndPreviewWithRepairStreaming(
      ctx, "proj-1", "a test app",
      (event) => stages.push(event.stage),
      { maxAttempts: 2 },
    );

    expect(stages).toContain("generation");
    expect(stages).toContain("repair");
    expect(stages).toContain("complete");
  });

  it("emits error stage on non-schema error", async () => {
    mockAdapter.generateGraphPackage.mockResolvedValue(null);

    const stages: StreamStageEvent["stage"][] = [];
    await expect(
      generateAndPreviewWithRepairStreaming(
        ctx, "proj-1", "quantum",
        (event) => stages.push(event.stage),
      ),
    ).rejects.toThrow(VibeServiceError);

    expect(stages).toContain("generation");
    expect(stages).toContain("error");
  });

  it("includes result in complete event", async () => {
    const validPkg = makeValidPackage();
    mockAdapter.generateGraphPackage.mockResolvedValue(validPkg as unknown);

    let completeResult: StreamStageEvent["result"] | undefined;
    await generateAndPreviewWithRepairStreaming(
      ctx, "proj-1", "a test app",
      (event) => {
        if (event.stage === "complete") completeResult = event.result;
      },
    );

    expect(completeResult).toBeDefined();
    expect(completeResult!.package).not.toBeNull();
    expect(completeResult!.success).toBe(true);
  });

  it("never calls install", async () => {
    const validPkg = makeValidPackage();
    mockAdapter.generateGraphPackage.mockResolvedValue(validPkg as unknown);

    await generateAndPreviewWithRepairStreaming(ctx, "proj-1", "test", () => {});

    expect(mockTenantStorage.getRecordTypeByKey).not.toHaveBeenCalled();
  });
});

// --- Prompt builder ---

describe("promptBuilder", () => {
  // Import dynamically to avoid mock interference
  it("buildSystemPrompt returns non-empty string", async () => {
    const { buildSystemPrompt } = await import("../vibe/promptBuilder");
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("vibe.");
    expect(prompt).toContain("JSON");
  });

  it("buildGenerationPrompt includes user prompt", async () => {
    const { buildGenerationPrompt } = await import("../vibe/promptBuilder");
    const prompt = buildGenerationPrompt("ticketing app", "My App");
    expect(prompt).toContain("ticketing app");
    expect(prompt).toContain("vibe.my_app");
  });

  it("buildRepairPrompt includes errors and original prompt", async () => {
    const { buildRepairPrompt } = await import("../vibe/promptBuilder");
    const prompt = buildRepairPrompt("ticketing", '{"bad": true}', "recordTypes: Required");
    expect(prompt).toContain("ticketing");
    expect(prompt).toContain("recordTypes: Required");
    expect(prompt).toContain('{"bad": true}');
  });

  it("buildRefinementPrompt includes existing package and instruction", async () => {
    const { buildRefinementPrompt } = await import("../vibe/promptBuilder");
    const prompt = buildRefinementPrompt('{"packageKey": "vibe.test"}', "add a priority field");
    expect(prompt).toContain("vibe.test");
    expect(prompt).toContain("add a priority field");
    expect(prompt).toContain("Refinement instruction");
  });
});
