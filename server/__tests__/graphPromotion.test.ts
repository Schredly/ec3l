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
  getGraphPackageInstallByVersion: vi.fn(),
  createEnvironmentPackageInstall: vi.fn(),
  listEnvironmentPackageInstalls: vi.fn(),
  getLatestEnvironmentPackageInstall: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import {
  installGraphPackage,
  computePackageChecksum,
} from "../graph/installGraphService";
import type { GraphPackage } from "../graph/installGraphService";
import {
  getEnvironmentPackageState,
  diffEnvironments,
  promoteEnvironmentPackages,
} from "../graph/promotionService";
import { emitDomainEvent } from "../services/domainEventService";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function makePkg(overrides: Partial<GraphPackage> = {}): GraphPackage {
  return {
    packageKey: "test-pkg",
    version: "1.0.0",
    recordTypes: [],
    ...overrides,
  };
}

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

// --- Environment install integration ---

describe("installGraphPackage — environment-aware", () => {
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
  });

  it("writes to both ledgers when environmentId is provided", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, {
      environmentId: "env-dev",
    });

    expect(result.success).toBe(true);
    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalledOnce();

    const envRow = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(envRow.environmentId).toBe("env-dev");
    expect(envRow.packageKey).toBe("test-pkg");
    expect(envRow.version).toBe("1.0.0");
    expect(envRow.source).toBe("install");
  });

  it("does not write environment row when environmentId is absent", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    await installGraphPackage(ctx, "proj-1", pkg);

    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createEnvironmentPackageInstall).not.toHaveBeenCalled();
  });

  it("does not write environment row in preview mode", async () => {
    const pkg = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, {
      previewOnly: true,
      environmentId: "env-dev",
    });

    expect(result.success).toBe(true);
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
    expect(mockTenantStorage.createEnvironmentPackageInstall).not.toHaveBeenCalled();
  });

  it("records source='promote' when specified", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    await installGraphPackage(ctx, "proj-1", pkg, {
      environmentId: "env-staging",
      source: "promote",
    });

    const envRow = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(envRow.source).toBe("promote");
  });
});

// --- Environment state ---

describe("getEnvironmentPackageState", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns latest per packageKey", async () => {
    mockTenantStorage.listEnvironmentPackageInstalls.mockResolvedValue([
      // newest first
      { packageKey: "hr.lite", version: "0.3.0", checksum: "c3", installedAt: new Date("2026-01-03"), source: "promote" },
      { packageKey: "itsm.lite", version: "1.0.0", checksum: "i1", installedAt: new Date("2026-01-02"), source: "install" },
      { packageKey: "hr.lite", version: "0.2.0", checksum: "c2", installedAt: new Date("2026-01-01"), source: "install" },
    ]);

    const state = await getEnvironmentPackageState(ctx, "env-dev");

    expect(state).toHaveLength(2);
    const hr = state.find((s) => s.packageKey === "hr.lite");
    expect(hr?.version).toBe("0.3.0");
    expect(hr?.source).toBe("promote");
    const itsm = state.find((s) => s.packageKey === "itsm.lite");
    expect(itsm?.version).toBe("1.0.0");
  });

  it("returns empty array for empty environment", async () => {
    mockTenantStorage.listEnvironmentPackageInstalls.mockResolvedValue([]);

    const state = await getEnvironmentPackageState(ctx, "env-prod");
    expect(state).toEqual([]);
  });
});

// --- Environment diff ---

describe("diffEnvironments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("detects missing packages", async () => {
    // "from" env has hr.lite, "to" env has nothing
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockResolvedValueOnce([ // from
        { packageKey: "hr.lite", version: "0.2.0", checksum: "c2", installedAt: new Date(), source: "install" },
      ])
      .mockResolvedValueOnce([]); // to

    const diff = await diffEnvironments(ctx, "env-dev", "env-staging");

    expect(diff.deltas).toHaveLength(1);
    expect(diff.deltas[0].status).toBe("missing");
    expect(diff.deltas[0].packageKey).toBe("hr.lite");
    expect(diff.deltas[0].fromVersion).toBeNull();
    expect(diff.deltas[0].toVersion).toBe("0.2.0");
  });

  it("detects outdated packages", async () => {
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockResolvedValueOnce([ // from (source of truth - newer)
        { packageKey: "hr.lite", version: "0.3.0", checksum: "c3", installedAt: new Date(), source: "install" },
      ])
      .mockResolvedValueOnce([ // to (target - older)
        { packageKey: "hr.lite", version: "0.2.0", checksum: "c2", installedAt: new Date(), source: "install" },
      ]);

    const diff = await diffEnvironments(ctx, "env-dev", "env-staging");

    expect(diff.deltas).toHaveLength(1);
    expect(diff.deltas[0].status).toBe("outdated");
    expect(diff.deltas[0].fromVersion).toBe("0.2.0");
    expect(diff.deltas[0].toVersion).toBe("0.3.0");
  });

  it("marks same-checksum packages as same", async () => {
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockResolvedValueOnce([
        { packageKey: "hr.lite", version: "0.2.0", checksum: "same-hash", installedAt: new Date(), source: "install" },
      ])
      .mockResolvedValueOnce([
        { packageKey: "hr.lite", version: "0.2.0", checksum: "same-hash", installedAt: new Date(), source: "install" },
      ]);

    const diff = await diffEnvironments(ctx, "env-dev", "env-staging");

    expect(diff.deltas).toHaveLength(1);
    expect(diff.deltas[0].status).toBe("same");
  });
});

// --- Promotion ---

describe("promoteEnvironmentPackages", () => {
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
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "test" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("promotes missing packages from source to target", async () => {
    setupDynamicCreateMock();

    const pkg: GraphPackage = {
      packageKey: "hr.lite",
      version: "0.2.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    };
    const checksum = computePackageChecksum(pkg);

    // Source env has hr.lite installed
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-dev") {
          return [{
            packageKey: "hr.lite",
            version: "0.2.0",
            checksum,
            installedAt: new Date(),
            source: "install",
            packageContents: pkg,
          }];
        }
        return []; // target is empty
      });

    const result = await promoteEnvironmentPackages(
      ctx,
      "env-dev",
      "env-staging",
      "proj-1",
    );

    expect(result.success).toBe(true);
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].packageKey).toBe("hr.lite");
    expect(result.promoted[0].result.success).toBe(true);
    expect(result.skipped).toHaveLength(0);

    // Environment row with source="promote"
    expect(mockTenantStorage.createEnvironmentPackageInstall).toHaveBeenCalledOnce();
    const envRow = mockTenantStorage.createEnvironmentPackageInstall.mock.calls[0][0];
    expect(envRow.source).toBe("promote");
    expect(envRow.environmentId).toBe("env-staging");

    // Domain event
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.package_promoted" }),
    );
  });

  it("skips packages that are already at same checksum", async () => {
    const pkg: GraphPackage = {
      packageKey: "hr.lite",
      version: "0.2.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    };
    const checksum = computePackageChecksum(pkg);

    // Both envs have same package at same checksum
    mockTenantStorage.listEnvironmentPackageInstalls.mockResolvedValue([{
      packageKey: "hr.lite",
      version: "0.2.0",
      checksum,
      installedAt: new Date(),
      source: "install",
      packageContents: pkg,
    }]);

    const result = await promoteEnvironmentPackages(
      ctx,
      "env-dev",
      "env-staging",
      "proj-1",
    );

    expect(result.success).toBe(true);
    expect(result.promoted).toHaveLength(0);
    expect(result.skipped).toEqual(["hr.lite"]);
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createEnvironmentPackageInstall).not.toHaveBeenCalled();
  });

  it("rejects downgrade promotion", async () => {
    const pkgOld: GraphPackage = {
      packageKey: "hr.lite",
      version: "0.1.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    };

    // Source has v0.1.0
    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-dev") {
          return [{
            packageKey: "hr.lite",
            version: "0.1.0",
            checksum: computePackageChecksum(pkgOld),
            installedAt: new Date(),
            source: "install",
            packageContents: pkgOld,
          }];
        }
        return []; // target is empty
      });

    // But global audit shows v0.2.0 was already installed
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      id: "gpi-existing",
      packageKey: "hr.lite",
      version: "0.2.0",
      checksum: "different-checksum",
    });

    const result = await promoteEnvironmentPackages(
      ctx,
      "env-dev",
      "env-staging",
      "proj-1",
    );

    expect(result.success).toBe(false);
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].result.rejected).toBe(true);
    expect(result.promoted[0].result.reason).toContain("lower than installed");
  });

  it("preview mode does not apply mutations", async () => {
    const pkg: GraphPackage = {
      packageKey: "hr.lite",
      version: "0.2.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    };

    mockTenantStorage.listEnvironmentPackageInstalls
      .mockImplementation(async (envId: string) => {
        if (envId === "env-dev") {
          return [{
            packageKey: "hr.lite",
            version: "0.2.0",
            checksum: computePackageChecksum(pkg),
            installedAt: new Date(),
            source: "install",
            packageContents: pkg,
          }];
        }
        return [];
      });

    const result = await promoteEnvironmentPackages(
      ctx,
      "env-dev",
      "env-staging",
      "proj-1",
      { previewOnly: true },
    );

    expect(result.success).toBe(true);
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].result.diff.addedRecordTypes).toHaveLength(1);
    // No mutations
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createEnvironmentPackageInstall).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
  });
});
