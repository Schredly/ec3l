import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";

// --- Mocks ---

const mockTenantStorage = {
  listRecordTypes: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  getLatestGraphPackageInstall: vi.fn(),
  listGraphPackageInstalls: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

// Mock the LLM adapter — stub streamGenerate returns tokens for a valid package
const mockAdapter = vi.hoisted(() => ({
  generateGraphPackage: vi.fn(),
  repairGraphPackage: vi.fn(),
  refineGraphPackage: vi.fn(),
  streamGenerate: vi.fn(),
  streamRefine: vi.fn(),
}));

vi.mock("../vibe/llmAdapter", () => ({
  createLlmAdapter: () => mockAdapter,
  extractJson: (text: string) => {
    try { return JSON.parse(text); } catch { /* fallback */ }
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) { try { return JSON.parse(fenceMatch[1]!.trim()); } catch { /* */ } }
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch { /* */ } }
    return null;
  },
}));

import {
  generateAndPreviewWithTokenStreaming,
  generateMultiWithTokenStreaming,
  MultiStreamError,
} from "../vibe/tokenStreamService";
import type { TokenStreamEvent, TokenStreamResult } from "../vibe/tokenStreamService";
import { emitDomainEvent } from "../services/domainEventService";
import { simpleTicketingAppTemplate } from "../vibe/vibeTemplates";
import type { GraphPackage } from "../graph/installGraphService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function setupEmptyGraphMocks() {
  mockTenantStorage.listRecordTypes.mockResolvedValue([]);
  mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
  mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
  mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);
  mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
  mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
}

const validPkg: GraphPackage = structuredClone(simpleTicketingAppTemplate);

function makeStreamGenerator(pkg: GraphPackage): () => AsyncGenerator<string, void, unknown> {
  return async function* () {
    const json = JSON.stringify(pkg, null, 2);
    const chunkSize = 20;
    for (let i = 0; i < json.length; i += chunkSize) {
      yield json.slice(i, i + chunkSize);
    }
  };
}

function makeEmptyStreamGenerator(): () => AsyncGenerator<string, void, unknown> {
  return async function* () {
    // yields nothing
  };
}

// --- Tests ---

describe("generateAndPreviewWithTokenStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("emits token events followed by stage events and complete", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    const events: TokenStreamEvent[] = [];
    const result = await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing system",
      (event) => events.push(event),
    );

    const tokenEvents = events.filter((e) => e.type === "token");
    const stageEvents = events.filter((e) => e.type === "stage");
    const completeEvents = events.filter((e) => e.type === "complete");

    expect(tokenEvents.length).toBeGreaterThan(0);
    expect(stageEvents.length).toBeGreaterThanOrEqual(4); // generation, extract_json, validate_schema, projection, diff
    expect(completeEvents).toHaveLength(1);
    expect(result.package).toBeDefined();
    expect(result.success).toBe(true);
  });

  it("stage events include generation, extract_json, validate_schema, projection, diff", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    const stages: string[] = [];
    await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing",
      (event) => { if (event.type === "stage") stages.push(event.stage); },
    );

    expect(stages).toContain("generation");
    expect(stages).toContain("extract_json");
    expect(stages).toContain("validate_schema");
    expect(stages).toContain("projection");
    expect(stages).toContain("diff");
  });

  it("token buffer reconstructs valid JSON", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    let buffer = "";
    await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing",
      (event) => { if (event.type === "token") buffer += event.data; },
    );

    const parsed = JSON.parse(buffer);
    expect(parsed.packageKey).toBe(validPkg.packageKey);
  });

  it("produces checksum and diff in complete result", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    const result = await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing",
      () => {},
    );

    expect(result.checksum).toBeTruthy();
    expect(result.diff).toBeDefined();
    expect(result.diff!.addedRecordTypes.length).toBeGreaterThan(0);
    expect(result.attempts).toBe(1);
  });

  it("emits vibe.llm_token_stream_started and vibe.llm_token_stream_completed", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    await generateAndPreviewWithTokenStreaming(ctx, "proj-1", "ticketing", () => {});

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "vibe.llm_token_stream_started", status: "started" }),
    );
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "vibe.llm_token_stream_completed", status: "completed" }),
    );
  });

  it("handles empty stream (no tokens) gracefully", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeEmptyStreamGenerator());

    const result = await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing",
      () => {},
      { maxAttempts: 1 },
    );

    expect(result.success).toBe(false);
    expect(result.package).toBeNull();
    expect(result.schemaErrors).toBeTruthy();
  });

  it("does not create any drafts or install packages (preview-only)", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    await generateAndPreviewWithTokenStreaming(ctx, "proj-1", "ticketing", () => {});

    // None of the draft/install storage methods should be called
    expect(mockTenantStorage.getRecordTypeByKey).not.toHaveBeenCalled();
  });

  it("handles invalid JSON in stream with schema error", async () => {
    mockAdapter.streamGenerate.mockImplementation(async function* () {
      yield "this is not valid json {{{";
    });

    const result = await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing",
      () => {},
      { maxAttempts: 1 },
    );

    expect(result.success).toBe(false);
    expect(result.package).toBeNull();
  });

  it("appName overrides packageKey in result", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    const result = await generateAndPreviewWithTokenStreaming(
      ctx, "proj-1", "ticketing",
      () => {},
      { appName: "My Cool App" },
    );

    expect(result.package!.packageKey).toBe("vibe.my_cool_app");
  });
});

describe("generateMultiWithTokenStreaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("generates multiple variants sequentially with variantIndex", async () => {
    mockAdapter.streamGenerate.mockImplementation(makeStreamGenerator(validPkg));

    const variantIndices = new Set<number>();
    const results = await generateMultiWithTokenStreaming(
      ctx, "proj-1", "ticketing", 2,
      (event) => { if (event.variantIndex !== undefined) variantIndices.add(event.variantIndex); },
    );

    expect(results).toHaveLength(2);
    expect(variantIndices.has(0)).toBe(true);
    expect(variantIndices.has(1)).toBe(true);
  });

  it("rejects count > 3 for streaming", async () => {
    await expect(
      generateMultiWithTokenStreaming(ctx, "proj-1", "ticketing", 4, () => {}),
    ).rejects.toThrow(MultiStreamError);
  });

  it("rejects count < 1", async () => {
    await expect(
      generateMultiWithTokenStreaming(ctx, "proj-1", "ticketing", 0, () => {}),
    ).rejects.toThrow(MultiStreamError);
  });
});

describe("extractJson (integration via token stream)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("extracts JSON from code-fenced output", async () => {
    const fencedOutput = "Here is the result:\n```json\n" + JSON.stringify(validPkg) + "\n```\nDone!";
    mockAdapter.streamGenerate.mockImplementation(async function* () {
      yield fencedOutput;
    });

    const result = await generateAndPreviewWithTokenStreaming(ctx, "proj-1", "ticketing", () => {});
    expect(result.success).toBe(true);
    expect(result.package).toBeDefined();
  });

  it("extracts JSON from brace-delimited text", async () => {
    const noisyOutput = "Sure! " + JSON.stringify(validPkg) + " Hope this helps!";
    mockAdapter.streamGenerate.mockImplementation(async function* () {
      yield noisyOutput;
    });

    const result = await generateAndPreviewWithTokenStreaming(ctx, "proj-1", "ticketing", () => {});
    expect(result.success).toBe(true);
  });
});
