import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { RecordType } from "@shared/schema";

// --- Mocks ---

const mockTenantStorage = {
  listRecordTypes: vi.fn(),
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
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
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import {
  generatePackageFromPrompt,
  refinePackageFromPrompt,
  previewVibePackage,
  installVibePackage,
  VibeServiceError,
} from "../vibe/vibeService";
import { computePackageChecksum } from "../graph/installGraphService";
import type { GraphPackage } from "../graph/installGraphService";
import { emitDomainEvent } from "../services/domainEventService";
import {
  onboardingAppTemplate,
  ptoRequestAppTemplate,
  vendorIntakeAppTemplate,
  simpleTicketingAppTemplate,
  vibeTemplateRegistry,
} from "../vibe/vibeTemplates";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

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

// --- Template structure tests ---

describe("vibeTemplates — package structure", () => {
  const templates = [
    { name: "onboarding", pkg: onboardingAppTemplate },
    { name: "pto", pkg: ptoRequestAppTemplate },
    { name: "vendor_intake", pkg: vendorIntakeAppTemplate },
    { name: "ticketing", pkg: simpleTicketingAppTemplate },
  ];

  it("has at least 4 templates in the registry", () => {
    expect(vibeTemplateRegistry.length).toBeGreaterThanOrEqual(4);
  });

  for (const { name, pkg } of templates) {
    it(`${name}: has vibe. prefix packageKey`, () => {
      expect(pkg.packageKey).toMatch(/^vibe\./);
    });

    it(`${name}: has version`, () => {
      expect(pkg.version).toBeTruthy();
    });

    it(`${name}: has at least 1 record type`, () => {
      expect(pkg.recordTypes.length).toBeGreaterThanOrEqual(1);
    });

    it(`${name}: all record types have key and fields`, () => {
      for (const rt of pkg.recordTypes) {
        expect(rt.key).toBeTruthy();
        expect(Array.isArray(rt.fields)).toBe(true);
        expect(rt.fields.length).toBeGreaterThan(0);
      }
    });

    it(`${name}: has SLA policy`, () => {
      expect(pkg.slaPolicies?.length).toBeGreaterThan(0);
    });

    it(`${name}: has assignment rule`, () => {
      expect(pkg.assignmentRules?.length).toBeGreaterThan(0);
    });

    it(`${name}: has workflow`, () => {
      expect(pkg.workflows?.length).toBeGreaterThan(0);
    });
  }
});

// --- generatePackageFromPrompt ---

describe("generatePackageFromPrompt — keyword matching", () => {
  it("matches onboarding template", async () => {
    const pkg = await generatePackageFromPrompt("I need an employee onboarding app");
    expect(pkg.recordTypes.map((r) => r.key)).toContain("onboard_request");
  });

  it("matches PTO template", async () => {
    const pkg = await generatePackageFromPrompt("Create a time off request system");
    expect(pkg.recordTypes.map((r) => r.key)).toContain("pto_request");
  });

  it("matches vendor intake template", async () => {
    const pkg = await generatePackageFromPrompt("vendor management and procurement tracking");
    expect(pkg.recordTypes.map((r) => r.key)).toContain("vendor");
  });

  it("matches ticketing template", async () => {
    const pkg = await generatePackageFromPrompt("simple helpdesk ticketing system");
    expect(pkg.recordTypes.map((r) => r.key)).toContain("ticket");
  });

  it("customizes packageKey with appName", async () => {
    const pkg = await generatePackageFromPrompt("ticketing", "My Support App");
    expect(pkg.packageKey).toBe("vibe.my_support_app");
  });

  it("throws for unrecognized prompt", async () => {
    await expect(generatePackageFromPrompt("build a quantum computer")).rejects.toThrow(VibeServiceError);
  });

  it("returns a deep clone (does not mutate template)", async () => {
    const pkg = await generatePackageFromPrompt("ticketing", "custom_app");
    pkg.recordTypes.push({ key: "extra", fields: [{ name: "x", type: "string" }] });
    // Original template should be unmodified
    expect(simpleTicketingAppTemplate.recordTypes.length).toBe(2);
  });
});

// --- refinePackageFromPrompt ---

describe("refinePackageFromPrompt — deterministic refinements", () => {
  let basePkg: GraphPackage;

  beforeEach(async () => {
    basePkg = await generatePackageFromPrompt("ticketing");
  });

  it("adds a field to an existing record type", async () => {
    const refined = await refinePackageFromPrompt(basePkg, "add field urgency to ticket");
    const ticket = refined.recordTypes.find((r) => r.key === "ticket")!;
    expect(ticket.fields.map((f) => f.name)).toContain("urgency");
  });

  it("returns a new package (does not mutate input)", async () => {
    const originalFieldCount = basePkg.recordTypes.find((r) => r.key === "ticket")!.fields.length;
    await refinePackageFromPrompt(basePkg, "add field urgency to ticket");
    expect(basePkg.recordTypes.find((r) => r.key === "ticket")!.fields.length).toBe(originalFieldCount);
  });

  it("changes checksum after adding a field", async () => {
    const beforeChecksum = computePackageChecksum(basePkg);
    const refined = await refinePackageFromPrompt(basePkg, "add field urgency to ticket");
    const afterChecksum = computePackageChecksum(refined);
    expect(afterChecksum).not.toBe(beforeChecksum);
  });

  it("renames the package", async () => {
    const refined = await refinePackageFromPrompt(basePkg, "rename to internal help desk");
    expect(refined.packageKey).toBe("vibe.internal_help_desk");
  });

  it("adds an SLA policy", async () => {
    const refined = await refinePackageFromPrompt(basePkg, "add sla 120 on ticket_comment");
    expect(refined.slaPolicies).toContainEqual({
      recordTypeKey: "ticket_comment",
      durationMinutes: 120,
    });
  });

  it("replaces existing SLA policy duration", async () => {
    const refined = await refinePackageFromPrompt(basePkg, "add sla 60 on ticket");
    const sla = refined.slaPolicies!.find((s) => s.recordTypeKey === "ticket")!;
    expect(sla.durationMinutes).toBe(60);
  });

  it("throws for unknown record type in add field", async () => {
    await expect(refinePackageFromPrompt(basePkg, "add field foo to nonexistent")).rejects.toThrow(VibeServiceError);
  });

  it("throws for duplicate field", async () => {
    await expect(refinePackageFromPrompt(basePkg, "add field title to ticket")).rejects.toThrow(VibeServiceError);
  });

  it("throws for unparsable refinement", async () => {
    await expect(refinePackageFromPrompt(basePkg, "make it prettier")).rejects.toThrow(VibeServiceError);
  });
});

// --- previewVibePackage ---

describe("previewVibePackage — graph preview pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyGraphMocks();
  });

  it("returns diff with added record types", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    const preview = await previewVibePackage(ctx, "proj-1", pkg);

    expect(preview.valid).toBe(true);
    expect(preview.diff.addedRecordTypes.length).toBeGreaterThan(0);
    expect(preview.checksum).toBeTruthy();
    expect(preview.package.packageKey).toBe(pkg.packageKey);
  });

  it("emits vibe.package_generated domain event", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    await previewVibePackage(ctx, "proj-1", pkg);

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.package_generated",
      status: "completed",
      entityId: "proj-1",
    }));
  });

  it("computes deterministic checksum", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    const preview1 = await previewVibePackage(ctx, "proj-1", pkg);
    const preview2 = await previewVibePackage(ctx, "proj-1", pkg);

    expect(preview1.checksum).toBe(preview2.checksum);
  });

  it("checksum changes after refinement", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    const preview1 = await previewVibePackage(ctx, "proj-1", pkg);

    const refined = await refinePackageFromPrompt(pkg, "add field urgency to ticket");
    const preview2 = await previewVibePackage(ctx, "proj-1", refined);

    expect(preview1.checksum).not.toBe(preview2.checksum);
  });
});

// --- installVibePackage ---

describe("installVibePackage — delegates to install engine", () => {
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

  it("installs via installGraphPackage and returns success", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    const result = await installVibePackage(ctx, "proj-1", pkg);

    expect(result.installResult.success).toBe(true);
    expect(result.installResult.diff.addedRecordTypes.length).toBeGreaterThan(0);
    expect(result.package.packageKey).toBe(pkg.packageKey);
  });

  it("writes audit trail via createGraphPackageInstall", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    await installVibePackage(ctx, "proj-1", pkg);

    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        packageKey: pkg.packageKey,
        version: pkg.version,
        projectId: "proj-1",
      }),
    );
  });

  it("writes env ledger when environmentId is provided", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    await installVibePackage(ctx, "proj-1", pkg, { environmentId: "env-dev" });

    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        packageKey: pkg.packageKey,
        environmentId: "env-dev",
        source: "install",
      }),
    );
  });

  it("emits vibe.package_installed domain event", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    await installVibePackage(ctx, "proj-1", pkg);

    expect(emitDomainEvent).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "vibe.package_installed",
      status: "completed",
      entityId: "proj-1",
    }));
  });

  it("returns noop when same checksum already installed", async () => {
    const pkg = await generatePackageFromPrompt("ticketing");
    const checksum = computePackageChecksum(pkg);
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      checksum,
      version: pkg.version,
    });

    const result = await installVibePackage(ctx, "proj-1", pkg);
    expect(result.installResult.noop).toBe(true);
    expect(result.installResult.success).toBe(true);
  });

  it("creates record types for all package record types", async () => {
    const pkg = await generatePackageFromPrompt("onboarding");
    await installVibePackage(ctx, "proj-1", pkg);

    // Should have created onboard_request and onboard_task
    const createCalls = mockTenantStorage.createRecordType.mock.calls;
    const createdKeys = createCalls.map((c: unknown[]) => (c[0] as Record<string, string>).key);
    expect(createdKeys).toContain("onboard_request");
    expect(createdKeys).toContain("onboard_task");
  });
});

// --- Cross-template uniqueness ---

describe("vibeTemplates — cross-template safety", () => {
  it("all templates have unique packageKeys", () => {
    const keys = vibeTemplateRegistry.map((t) => t.template.packageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("no record type key overlap between templates", () => {
    const allKeys: string[] = [];
    for (const entry of vibeTemplateRegistry) {
      for (const rt of entry.template.recordTypes) {
        allKeys.push(rt.key);
      }
    }
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it("all templates produce valid checksums", () => {
    for (const entry of vibeTemplateRegistry) {
      const checksum = computePackageChecksum(entry.template);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
