import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { RecordType, PromotionIntent } from "@shared/schema";

// --- Mocks ---

const mockTenantStorage = {
  // Record types
  listRecordTypes: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  createRecordType: vi.fn(),
  updateRecordTypeSchema: vi.fn(),
  updateRecordTypeSlaConfig: vi.fn(),
  updateRecordTypeAssignmentConfig: vi.fn(),
  // Projects
  getProject: vi.fn(),
  // Workflows
  getWorkflowDefinitionsByTenant: vi.fn(),
  getWorkflowTriggersByTenant: vi.fn(),
  createWorkflowDefinition: vi.fn(),
  createWorkflowTrigger: vi.fn(),
  createWorkflowStep: vi.fn(),
  updateWorkflowDefinitionStatus: vi.fn(),
  // Graph package installs
  getLatestGraphPackageInstall: vi.fn(),
  createGraphPackageInstall: vi.fn(),
  listGraphPackageInstalls: vi.fn(),
  getGraphPackageInstallByVersion: vi.fn(),
  // Environment package installs
  createEnvironmentPackageInstall: vi.fn(),
  listEnvironmentPackageInstalls: vi.fn(),
  getLatestEnvironmentPackageInstall: vi.fn(),
  // Environments
  getEnvironment: vi.fn(),
  // Promotion intents
  createPromotionIntent: vi.fn(),
  getPromotionIntent: vi.fn(),
  updatePromotionIntent: vi.fn(),
  listPromotionIntents: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import { installGraphPackage, computePackageChecksum } from "../graph/installGraphService";
import { itsmLitePackage } from "../graph/packages/itsmLite";
import {
  createPromotionIntent,
  previewPromotionIntent,
  approvePromotionIntent,
  executePromotionIntent,
  rejectPromotionIntent,
  PromotionIntentError,
} from "../graph/promotionIntentService";
import {
  diffEnvironments,
  promoteEnvironmentPackages,
} from "../graph/promotionService";
import { emitDomainEvent } from "../services/domainEventService";
import { listBuiltInPackages, getBuiltInPackage } from "../graph/graphService";
import { hrLitePackage } from "../graph/packages/hrLite";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

/** Set up dynamic mock that tracks created types */
function setupDynamicCreateMock() {
  const createdTypes = new Map<string, RecordType>();
  mockTenantStorage.getRecordTypeByKey.mockImplementation(async (key: string) => {
    return createdTypes.get(key) ?? undefined;
  });
  mockTenantStorage.createRecordType.mockImplementation(async (data: any) => {
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
    createdTypes.set(data.key, rt as RecordType);
    return rt;
  });
  mockTenantStorage.listRecordTypes.mockImplementation(async () => {
    return Array.from(createdTypes.values());
  });
  return createdTypes;
}

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
    ...overrides,
  };
}

// --- ITSM Lite Package Shape ---

describe("ITSM Lite package structure", () => {
  it("is registered in built-in packages", () => {
    const all = listBuiltInPackages();
    const itsm = all.find((p) => p.packageKey === "itsm.lite");
    expect(itsm).toBeDefined();
    expect(itsm!.version).toBe("0.1.0");
  });

  it("is retrievable by key", () => {
    const pkg = getBuiltInPackage("itsm.lite");
    expect(pkg).toBeDefined();
    expect(pkg!.packageKey).toBe("itsm.lite");
  });

  it("has 4 record types", () => {
    expect(itsmLitePackage.recordTypes).toHaveLength(4);
    const keys = itsmLitePackage.recordTypes.map((rt) => rt.key);
    expect(keys).toContain("cmdb_ci");
    expect(keys).toContain("incident");
    expect(keys).toContain("problem");
    expect(keys).toContain("itsm_change");
  });

  it("has SLA policy for incident", () => {
    expect(itsmLitePackage.slaPolicies).toHaveLength(1);
    expect(itsmLitePackage.slaPolicies![0].recordTypeKey).toBe("incident");
    expect(itsmLitePackage.slaPolicies![0].durationMinutes).toBe(240);
  });

  it("has assignment rule for incident", () => {
    expect(itsmLitePackage.assignmentRules).toHaveLength(1);
    expect(itsmLitePackage.assignmentRules![0].recordTypeKey).toBe("incident");
    expect(itsmLitePackage.assignmentRules![0].strategyType).toBe("static_group");
  });

  it("has incident intake workflow with 2 steps", () => {
    expect(itsmLitePackage.workflows).toHaveLength(1);
    const wf = itsmLitePackage.workflows![0];
    expect(wf.key).toBe("incident_intake");
    expect(wf.recordTypeKey).toBe("incident");
    expect(wf.triggerEvent).toBe("record_created");
    expect(wf.steps).toHaveLength(2);
  });

  it("produces a deterministic checksum", () => {
    const c1 = computePackageChecksum(itsmLitePackage);
    const c2 = computePackageChecksum(itsmLitePackage);
    expect(c1).toBe(c2);
    expect(typeof c1).toBe("string");
    expect(c1.length).toBe(64); // SHA-256 hex
  });
});

// --- Install into DEV environment ---

describe("install itsm.lite into DEV environment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.createEnvironmentPackageInstall.mockResolvedValue({ id: "epi-1" });
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "Incident Intake" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("installs all 4 record types + bindings into DEV env", async () => {
    setupDynamicCreateMock();

    const result = await installGraphPackage(ctx, "proj-1", itsmLitePackage, {
      environmentId: "env-dev",
    });

    expect(result.success).toBe(true);
    expect(result.noop).toBeFalsy();
    expect(result.checksum).toBeTruthy();

    // 4 record types created
    expect(mockTenantStorage.createRecordType).toHaveBeenCalledTimes(4);
    const createdKeys = mockTenantStorage.createRecordType.mock.calls.map(
      (c: any[]) => c[0].key,
    );
    expect(createdKeys).toContain("cmdb_ci");
    expect(createdKeys).toContain("incident");
    expect(createdKeys).toContain("problem");
    expect(createdKeys).toContain("itsm_change");

    // SLA config applied to incident
    expect(mockTenantStorage.updateRecordTypeSlaConfig).toHaveBeenCalledOnce();
    const slaCall = mockTenantStorage.updateRecordTypeSlaConfig.mock.calls[0];
    expect(slaCall[0]).toBe("rt-incident");
    expect(slaCall[1]).toEqual({ durationMinutes: 240 });

    // Assignment config applied to incident
    expect(mockTenantStorage.updateRecordTypeAssignmentConfig).toHaveBeenCalledOnce();
    const assignCall = mockTenantStorage.updateRecordTypeAssignmentConfig.mock.calls[0];
    expect(assignCall[0]).toBe("rt-incident");

    // Workflow created with 2 steps
    expect(mockTenantStorage.createWorkflowDefinition).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createWorkflowStep).toHaveBeenCalledTimes(2);

    // Both ledgers written
    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalledOnce();

    // Environment row has correct attributes
    const envRow = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(envRow.environmentId).toBe("env-dev");
    expect(envRow.packageKey).toBe("itsm.lite");
    expect(envRow.version).toBe("0.1.0");
    expect(envRow.source).toBe("install");

    // Domain event emitted
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.package_installed" }),
    );
  });

  it("graph_package_installs row contains package contents", async () => {
    setupDynamicCreateMock();

    await installGraphPackage(ctx, "proj-1", itsmLitePackage, {
      environmentId: "env-dev",
    });

    const gpiCall = mockTenantStorage.createGraphPackageInstall.mock.calls[0][0];
    expect(gpiCall.packageKey).toBe("itsm.lite");
    expect(gpiCall.version).toBe("0.1.0");
    expect(gpiCall.checksum).toBeTruthy();
    expect(gpiCall.packageContents).toBeTruthy();
    expect((gpiCall.packageContents as any).recordTypes).toHaveLength(4);
  });

  it("is idempotent on second install (noop)", async () => {
    const checksum = computePackageChecksum(itsmLitePackage);
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      id: "gpi-existing",
      packageKey: "itsm.lite",
      version: "0.1.0",
      checksum,
    });

    const result = await installGraphPackage(ctx, "proj-1", itsmLitePackage, {
      environmentId: "env-dev",
    });

    expect(result.success).toBe(true);
    expect(result.noop).toBe(true);
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createEnvironmentPackageInstall).not.toHaveBeenCalled();
  });
});

// --- Full Promotion Intent Lifecycle: DEV → STAGING ---

describe("promotion intent lifecycle: DEV → STAGING", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("create → preview → approve → execute full flow", async () => {
    // 1. Create intent
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-dev", name: "dev", requiresPromotionApproval: false })
      .mockResolvedValueOnce({ id: "env-staging", name: "test", requiresPromotionApproval: false });
    const draftIntent = makeIntent({ status: "draft" });
    mockTenantStorage.createPromotionIntent.mockResolvedValue(draftIntent);

    const created = await createPromotionIntent(ctx, {
      projectId: "proj-1",
      fromEnvironmentId: "env-dev",
      toEnvironmentId: "env-staging",
      createdBy: "user-1",
    });
    expect(created.status).toBe("draft");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_created" }),
    );

    // 2. Preview intent — stores diff
    const diff = {
      fromEnvironmentId: "env-dev",
      toEnvironmentId: "env-staging",
      deltas: [
        { packageKey: "itsm.lite", status: "missing", fromVersion: null, toVersion: "0.1.0", fromChecksum: null, toChecksum: "abc123" },
      ],
    };
    mockTenantStorage.getPromotionIntent.mockResolvedValue(draftIntent);
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockResolvedValueOnce([{
        packageKey: "itsm.lite",
        version: "0.1.0",
        checksum: "abc123",
        installedAt: new Date(),
        source: "install",
      }])
      .mockResolvedValueOnce([]); // staging empty
    const previewedIntent = makeIntent({ status: "previewed", diff });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(previewedIntent);

    const previewed = await previewPromotionIntent(ctx, "pi-1");
    expect(previewed.status).toBe("previewed");
    expect(previewed.diff).toBeTruthy();

    // Verify diff was stored
    const updateCall = mockTenantStorage.updatePromotionIntent.mock.calls[0];
    expect(updateCall[1].status).toBe("previewed");
    expect(updateCall[1].diff).toBeTruthy();
    expect(updateCall[1].diff.deltas).toHaveLength(1);
    expect(updateCall[1].diff.deltas[0].packageKey).toBe("itsm.lite");
    expect(updateCall[1].diff.deltas[0].status).toBe("missing");

    vi.mocked(emitDomainEvent).mockClear();

    // 3. Approve intent — requires human actor (non-agent)
    mockTenantStorage.getPromotionIntent.mockResolvedValue(previewedIntent);
    const approvedIntent = makeIntent({
      status: "approved",
      approvedBy: "user-1",
      approvedAt: new Date(),
    });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(approvedIntent);

    const approved = await approvePromotionIntent(ctx, "pi-1", "user-1");
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("user-1");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_approved" }),
    );

    vi.mocked(emitDomainEvent).mockClear();

    // 4. Execute intent — calls promoteEnvironmentPackages, stores result
    mockTenantStorage.getPromotionIntent.mockResolvedValue(approvedIntent);

    // Set up promotion to succeed
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-2" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.createEnvironmentPackageInstall.mockResolvedValue({ id: "epi-2" });
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-2", name: "Incident Intake" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-2" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-2" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});

    const checksum = computePackageChecksum(itsmLitePackage);
    // From env has itsm.lite, to env is empty
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-dev") {
          return [{
            packageKey: "itsm.lite",
            version: "0.1.0",
            checksum,
            installedAt: new Date(),
            source: "install",
            packageContents: itsmLitePackage,
          }];
        }
        return [];
      });

    setupDynamicCreateMock();

    const promotionResult = { success: true, promoted: [{ packageKey: "itsm.lite", result: { success: true } }], skipped: [] };
    const executedIntent = makeIntent({ status: "executed", result: promotionResult });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(executedIntent);

    const executed = await executePromotionIntent(ctx, "pi-1");
    expect(executed.status).toBe("executed");
    expect(executed.result).toBeTruthy();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.promotion_intent_executed" }),
    );

    // Verify promoteEnvironmentPackages was called with correct args
    // (it's a real function in this test, so we verify via its storage calls)
    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalled();
    const promoteEnvRow = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(promoteEnvRow.environmentId).toBe("env-staging");
    expect(promoteEnvRow.source).toBe("promote");
    expect(promoteEnvRow.packageKey).toBe("itsm.lite");
  });
});

// --- Environment Gate: requiresPromotionApproval ---

describe("environment gate: requiresPromotionApproval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.createEnvironmentPackageInstall.mockResolvedValue({ id: "epi-1" });
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "Incident Intake" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("direct promotion still works when gate is NOT set on target", async () => {
    setupDynamicCreateMock();
    const checksum = computePackageChecksum(itsmLitePackage);

    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-staging") {
          return [{
            packageKey: "itsm.lite",
            version: "0.1.0",
            checksum,
            installedAt: new Date(),
            source: "install",
            packageContents: itsmLitePackage,
          }];
        }
        return [];
      });

    const result = await promoteEnvironmentPackages(
      ctx,
      "env-staging",
      "env-prod",
      "proj-1",
    );

    expect(result.success).toBe(true);
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].packageKey).toBe("itsm.lite");
  });

  it("intent workflow works for gated environments (full lifecycle proof)", async () => {
    // This proves that even when direct promotion is blocked (tested at route level),
    // the PromotionIntent lifecycle correctly chains through all states.

    // Step 1: Create intent for STAGING → PROD
    mockTenantStorage.getEnvironment
      .mockResolvedValueOnce({ id: "env-staging", name: "test" })
      .mockResolvedValueOnce({ id: "env-prod", name: "prod", requiresPromotionApproval: true });
    const draftIntent = makeIntent({
      fromEnvironmentId: "env-staging",
      toEnvironmentId: "env-prod",
    });
    mockTenantStorage.createPromotionIntent.mockResolvedValue(draftIntent);

    const created = await createPromotionIntent(ctx, {
      projectId: "proj-1",
      fromEnvironmentId: "env-staging",
      toEnvironmentId: "env-prod",
      createdBy: "user-1",
    });
    expect(created.status).toBe("draft");

    // Step 2: Preview
    mockTenantStorage.getPromotionIntent.mockResolvedValue(draftIntent);
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockResolvedValueOnce([{
        packageKey: "itsm.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        source: "promote",
      }])
      .mockResolvedValueOnce([]);
    const previewedIntent = makeIntent({
      status: "previewed",
      fromEnvironmentId: "env-staging",
      toEnvironmentId: "env-prod",
      diff: { deltas: [{ packageKey: "itsm.lite", status: "missing" }] },
    });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(previewedIntent);
    await previewPromotionIntent(ctx, "pi-1");

    // Step 3: Approve (human actor)
    mockTenantStorage.getPromotionIntent.mockResolvedValue(previewedIntent);
    const approvedIntent = makeIntent({
      status: "approved",
      fromEnvironmentId: "env-staging",
      toEnvironmentId: "env-prod",
      approvedBy: "user-1",
      approvedAt: new Date(),
    });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(approvedIntent);
    const approved = await approvePromotionIntent(ctx, "pi-1", "user-1");
    expect(approved.status).toBe("approved");

    // Step 4: Execute — promotes into PROD env ledger
    setupDynamicCreateMock();
    const checksum = computePackageChecksum(itsmLitePackage);
    mockTenantStorage.getPromotionIntent.mockResolvedValue(approvedIntent);
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-staging") {
          return [{
            packageKey: "itsm.lite",
            version: "0.1.0",
            checksum,
            installedAt: new Date(),
            source: "promote",
            packageContents: itsmLitePackage,
          }];
        }
        return [];
      });

    const executedResult = { success: true, promoted: [{ packageKey: "itsm.lite", result: { success: true } }], skipped: [] };
    const executedIntent = makeIntent({
      status: "executed",
      fromEnvironmentId: "env-staging",
      toEnvironmentId: "env-prod",
      result: executedResult,
    });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(executedIntent);

    const executed = await executePromotionIntent(ctx, "pi-1");
    expect(executed.status).toBe("executed");
    expect(executed.result).toBeTruthy();

    // Verify environment_package_installs row written for PROD
    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalled();
    const prodEnvRow = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(prodEnvRow.environmentId).toBe("env-prod");
    expect(prodEnvRow.source).toBe("promote");
    expect(prodEnvRow.packageKey).toBe("itsm.lite");

    // Verify promotion_intents updated with result
    const updateCall = mockTenantStorage.updatePromotionIntent.mock.calls[
      mockTenantStorage.updatePromotionIntent.mock.calls.length - 1
    ];
    expect(updateCall[1].status).toBe("executed");
    expect(updateCall[1].result).toBeTruthy();
  });
});

// --- Ledger Consistency ---

describe("ledger consistency across lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.createEnvironmentPackageInstall.mockResolvedValue({ id: "epi-1" });
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "Incident Intake" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("install writes to both global and environment ledgers with correct checksums", async () => {
    setupDynamicCreateMock();

    await installGraphPackage(ctx, "proj-1", itsmLitePackage, {
      environmentId: "env-dev",
    });

    // Global ledger
    const gpiCall = mockTenantStorage.createGraphPackageInstall.mock.calls[0][0];
    expect(gpiCall.packageKey).toBe("itsm.lite");
    expect(gpiCall.version).toBe("0.1.0");
    expect(gpiCall.checksum).toBe(computePackageChecksum(itsmLitePackage));

    // Environment ledger
    const epiCall = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(epiCall.packageKey).toBe("itsm.lite");
    expect(epiCall.version).toBe("0.1.0");
    expect(epiCall.checksum).toBe(computePackageChecksum(itsmLitePackage));
    expect(epiCall.environmentId).toBe("env-dev");

    // Both have matching checksums
    expect(gpiCall.checksum).toBe(epiCall.checksum);
  });

  it("promotion writes promote source to target environment ledger", async () => {
    setupDynamicCreateMock();
    const checksum = computePackageChecksum(itsmLitePackage);

    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-dev") {
          return [{
            packageKey: "itsm.lite",
            version: "0.1.0",
            checksum,
            installedAt: new Date(),
            source: "install",
            packageContents: itsmLitePackage,
          }];
        }
        return [];
      });

    const result = await promoteEnvironmentPackages(
      ctx,
      "env-dev",
      "env-staging",
      "proj-1",
    );

    expect(result.success).toBe(true);

    // Environment ledger for staging
    const epiCall = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(epiCall.environmentId).toBe("env-staging");
    expect(epiCall.source).toBe("promote");
    expect(epiCall.packageKey).toBe("itsm.lite");
    expect(epiCall.version).toBe("0.1.0");

    // graph.package_promoted event emitted
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.package_promoted" }),
    );
  });

  it("promotion intent stores diff with correct package deltas", async () => {
    const diff = {
      fromEnvironmentId: "env-dev",
      toEnvironmentId: "env-staging",
      deltas: [
        {
          packageKey: "itsm.lite",
          status: "missing",
          fromVersion: null,
          toVersion: "0.1.0",
          fromChecksum: null,
          toChecksum: computePackageChecksum(itsmLitePackage),
        },
      ],
    };

    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "draft" }));
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockResolvedValueOnce([{
        packageKey: "itsm.lite",
        version: "0.1.0",
        checksum: computePackageChecksum(itsmLitePackage),
        installedAt: new Date(),
        source: "install",
      }])
      .mockResolvedValueOnce([]);
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(makeIntent({ status: "previewed", diff }));

    await previewPromotionIntent(ctx, "pi-1");

    const updateCall = mockTenantStorage.updatePromotionIntent.mock.calls[0];
    expect(updateCall[1].diff.deltas).toHaveLength(1);
    expect(updateCall[1].diff.deltas[0].packageKey).toBe("itsm.lite");
    expect(updateCall[1].diff.deltas[0].toChecksum).toBe(computePackageChecksum(itsmLitePackage));
  });

  it("promotion intent stores execution result with terminal status", async () => {
    const promotionResult = {
      success: true,
      promoted: [{ packageKey: "itsm.lite", result: { success: true, checksum: "abc" } }],
      skipped: [],
    };

    setupDynamicCreateMock();
    const checksum = computePackageChecksum(itsmLitePackage);

    mockTenantStorage.getPromotionIntent.mockResolvedValue(makeIntent({ status: "approved" }));
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-dev") {
          return [{
            packageKey: "itsm.lite",
            version: "0.1.0",
            checksum,
            installedAt: new Date(),
            source: "install",
            packageContents: itsmLitePackage,
          }];
        }
        return [];
      });

    const executedIntent = makeIntent({ status: "executed", result: promotionResult });
    mockTenantStorage.updatePromotionIntent.mockResolvedValue(executedIntent);

    const result = await executePromotionIntent(ctx, "pi-1");
    expect(result.status).toBe("executed");

    // Verify update stored result
    const updateCall = mockTenantStorage.updatePromotionIntent.mock.calls[0];
    expect(updateCall[1].status).toBe("executed");
    expect(updateCall[1].result.success).toBe(true);
    expect(updateCall[1].result.promoted).toHaveLength(1);
    expect(updateCall[1].result.promoted[0].packageKey).toBe("itsm.lite");
  });
});

// --- Ownership Isolation ---

describe("ownership isolation between packages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
  });

  it("itsm.lite and hr.lite have no record type key overlap", () => {
    const itsmKeys = new Set(itsmLitePackage.recordTypes.map((rt) => rt.key));
    const hrKeys = new Set(hrLitePackage.recordTypes.map((rt) => rt.key));

    for (const key of itsmKeys) {
      expect(hrKeys.has(key)).toBe(false);
    }
  });

  it("rejects itsm.lite install when its types are owned by another package", async () => {
    // Simulate hr.lite previously installed claiming "incident" key
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-old",
        packageKey: "other.package",
        version: "1.0.0",
        checksum: "fake",
        installedAt: new Date(),
        packageContents: { recordTypes: [{ key: "incident" }] },
      },
    ]);

    setupDynamicCreateMock();

    const result = await installGraphPackage(ctx, "proj-1", itsmLitePackage);

    expect(result.success).toBe(false);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0].code).toBe("PACKAGE_OWNERSHIP_CONFLICT");
    expect(result.validationErrors[0].message).toContain("incident");
    expect(result.validationErrors[0].message).toContain("other.package");
  });
});
