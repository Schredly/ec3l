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
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import {
  installGraphPackage,
  installGraphPackages,
  projectPackageOntoSnapshot,
  topologicalSortTypes,
  topologicalSortPackages,
  computePackageChecksum,
  compareSemver,
} from "../graph/installGraphService";
import type { GraphPackage } from "../graph/installGraphService";
import { hrLitePackage } from "../graph/packages/hrLite";
import { emitDomainEvent } from "../services/domainEventService";
import type { GraphSnapshot, RecordTypeNode } from "../graph/graphContracts";

const ctx: TenantContext = { tenantId: "t-1", userId: "user-1", source: "header" };

function makeRecordType(key: string, overrides: Partial<RecordType> = {}): RecordType {
  return {
    id: `rt-${key}`,
    tenantId: "t-1",
    projectId: "proj-1",
    name: key.charAt(0).toUpperCase() + key.slice(1),
    key,
    description: null,
    baseType: null,
    schema: { fields: [] },
    assignmentConfig: null,
    slaConfig: null,
    version: 1,
    status: "active",
    createdAt: new Date(),
    ...overrides,
  };
}

function makePkg(overrides: Partial<GraphPackage> = {}): GraphPackage {
  return {
    packageKey: "test-pkg",
    version: "1.0.0",
    recordTypes: [],
    ...overrides,
  };
}

/** Set up dynamic mock that tracks created types so baseType lookups resolve */
function setupDynamicCreateMock() {
  const createdTypes = new Map<string, RecordType>();
  mockTenantStorage.getRecordTypeByKey.mockImplementation(async (key: string) => {
    return createdTypes.get(key) ?? undefined;
  });
  mockTenantStorage.createRecordType.mockImplementation(async (data) => {
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
  // Also make listRecordTypes dynamic so batch installs see prior packages' types
  mockTenantStorage.listRecordTypes.mockImplementation(async () => {
    return Array.from(createdTypes.values());
  });
  return createdTypes;
}

// --- Pure function tests ---

describe("projectPackageOntoSnapshot — pure projection", () => {
  function makeSnapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
    return {
      tenantId: "t-1",
      builtAt: new Date().toISOString(),
      nodes: [],
      fields: [],
      edges: [],
      bindings: { workflows: [], slas: [], assignments: [], changePolicies: [] },
      ...overrides,
    };
  }

  function makeNode(key: string, overrides: Partial<RecordTypeNode> = {}): RecordTypeNode {
    return {
      id: `rt-${key}`,
      type: "record_type",
      tenantId: "t-1",
      version: 1,
      key,
      baseType: null,
      status: "active",
      projectId: "proj-1",
      ...overrides,
    };
  }

  it("adds new record types to the snapshot", () => {
    const current = makeSnapshot();
    const pkg = makePkg({
      recordTypes: [
        { key: "incident", fields: [{ name: "severity", type: "choice" }] },
      ],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.nodes).toHaveLength(1);
    expect(projected.nodes[0].key).toBe("incident");
    expect(projected.nodes[0].projectId).toBe("proj-1");
    expect(projected.fields).toHaveLength(1);
    expect(projected.fields[0].name).toBe("severity");
  });

  it("merges fields into existing record types", () => {
    const current = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
      ],
    });
    const pkg = makePkg({
      recordTypes: [
        { key: "task", fields: [
          { name: "title", type: "string" },
          { name: "priority", type: "number" },
        ]},
      ],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.nodes).toHaveLength(1);
    expect(projected.fields).toHaveLength(2);
    expect(projected.fields.map((f) => f.name).sort()).toEqual(["priority", "title"]);
  });

  it("adds baseType inheritance edge for new types", () => {
    const current = makeSnapshot({
      nodes: [makeNode("task")],
    });
    const pkg = makePkg({
      recordTypes: [
        { key: "incident", baseType: "task", fields: [] },
      ],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.nodes).toHaveLength(2);
    expect(projected.edges).toHaveLength(1);
    expect(projected.edges[0]).toEqual({
      fromType: "incident",
      toType: "task",
      relationship: "inherits",
      cardinality: "one-to-one",
    });
  });

  it("does not duplicate existing fields", () => {
    const current = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "task", name: "status", fieldType: "choice", required: false },
      ],
    });
    const pkg = makePkg({
      recordTypes: [
        { key: "task", fields: [
          { name: "title", type: "string" },
          { name: "status", type: "choice" },
        ]},
      ],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.fields).toHaveLength(2);
  });
});

describe("topologicalSortTypes", () => {
  it("sorts base types before derived types", () => {
    const types = [
      { key: "incident", baseType: "task", fields: [] },
      { key: "task", fields: [] },
    ];
    const sorted = topologicalSortTypes(types);
    expect(sorted.map((t) => t.key)).toEqual(["task", "incident"]);
  });

  it("handles types with external base types", () => {
    const types = [
      { key: "incident", baseType: "external_task", fields: [] },
      { key: "problem", fields: [] },
    ];
    const sorted = topologicalSortTypes(types);
    expect(sorted).toHaveLength(2);
  });

  it("handles deep inheritance chains", () => {
    const types = [
      { key: "critical_incident", baseType: "incident", fields: [] },
      { key: "task", fields: [] },
      { key: "incident", baseType: "task", fields: [] },
    ];
    const sorted = topologicalSortTypes(types);
    expect(sorted.map((t) => t.key)).toEqual(["task", "incident", "critical_incident"]);
  });
});

describe("computePackageChecksum", () => {
  it("produces deterministic output for same content", () => {
    const pkg1 = makePkg({
      recordTypes: [
        { key: "task", fields: [{ name: "b", type: "string" }, { name: "a", type: "number" }] },
      ],
    });
    const pkg2 = makePkg({
      recordTypes: [
        { key: "task", fields: [{ name: "a", type: "number" }, { name: "b", type: "string" }] },
      ],
    });
    expect(computePackageChecksum(pkg1)).toBe(computePackageChecksum(pkg2));
  });

  it("produces different output for different content", () => {
    const pkg1 = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "a", type: "string" }] }],
    });
    const pkg2 = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "a", type: "number" }] }],
    });
    expect(computePackageChecksum(pkg1)).not.toBe(computePackageChecksum(pkg2));
  });
});

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });
  it("returns -1 when a < b", () => {
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
  });
  it("returns 1 when a > b", () => {
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
  });
});

describe("topologicalSortPackages", () => {
  it("sorts packages by dependsOn", () => {
    const a = makePkg({ packageKey: "a", dependsOn: [{ packageKey: "b" }] });
    const b = makePkg({ packageKey: "b" });
    const sorted = topologicalSortPackages([a, b]);
    expect(sorted.map((p) => p.packageKey)).toEqual(["b", "a"]);
  });

  it("handles packages with no dependencies", () => {
    const a = makePkg({ packageKey: "a" });
    const b = makePkg({ packageKey: "b" });
    const sorted = topologicalSortPackages([a, b]);
    expect(sorted).toHaveLength(2);
  });

  it("handles transitive dependency chains", () => {
    const a = makePkg({ packageKey: "a", dependsOn: [{ packageKey: "b" }] });
    const b = makePkg({ packageKey: "b", dependsOn: [{ packageKey: "c" }] });
    const c = makePkg({ packageKey: "c" });
    const sorted = topologicalSortPackages([a, b, c]);
    expect(sorted.map((p) => p.packageKey)).toEqual(["c", "b", "a"]);
  });
});

// --- Integration tests ---

describe("installGraphPackage — integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
  });

  it("preview returns diff without making any mutations", async () => {
    const pkg = makePkg({
      recordTypes: [
        { key: "incident", fields: [{ name: "severity", type: "choice" }] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, { previewOnly: true });

    expect(result.success).toBe(true);
    expect(result.diff.addedRecordTypes).toHaveLength(1);
    expect(result.diff.addedRecordTypes[0].key).toBe("incident");
    expect(result.appliedCount).toBeUndefined();
    expect(result.checksum).toBeDefined();
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("returns validation errors for invalid package (orphan baseType)", async () => {
    const pkg = makePkg({
      recordTypes: [
        { key: "incident", baseType: "nonexistent", fields: [] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(false);
    expect(result.validationErrors.length).toBeGreaterThanOrEqual(1);
    expect(result.validationErrors[0].code).toBe("ORPHAN_BASE_TYPE");
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
  });

  it("returns validation errors for cross-project baseType", async () => {
    const taskInOtherProject = makeRecordType("task", { projectId: "proj-other" });
    mockTenantStorage.listRecordTypes.mockResolvedValue([taskInOtherProject]);

    const pkg = makePkg({
      recordTypes: [
        { key: "incident", baseType: "task", fields: [] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(false);
    expect(result.validationErrors.some((e) => e.code === "BASE_TYPE_CROSS_PROJECT")).toBe(true);
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
  });

  it("installs valid package and emits domain event", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [
        { key: "task", fields: [{ name: "title", type: "string" }] },
        { key: "incident", baseType: "task", fields: [{ name: "severity", type: "choice" }] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(2);
    expect(result.diff.addedRecordTypes).toHaveLength(2);
    expect(result.checksum).toBeDefined();

    const createCalls = mockTenantStorage.createRecordType.mock.calls;
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0][0].key).toBe("task");
    expect(createCalls[1][0].key).toBe("incident");

    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "graph.package_installed",
        status: "completed",
        entityId: "proj-1",
      }),
    );
  });

  it("merges fields into existing record types", async () => {
    const existingTask = makeRecordType("task", {
      schema: { fields: [{ name: "title", type: "string", required: true }] },
    });
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingTask]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(existingTask);
    mockTenantStorage.updateRecordTypeSchema.mockResolvedValue({ ...existingTask });

    const pkg = makePkg({
      recordTypes: [
        { key: "task", fields: [
          { name: "title", type: "string" },
          { name: "priority", type: "number" },
        ]},
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledOnce();
    const [_id, newSchema] = mockTenantStorage.updateRecordTypeSchema.mock.calls[0];
    expect(newSchema.fields).toHaveLength(2);
    expect(newSchema.fields[1]).toEqual({ name: "priority", type: "number", required: false });
  });

  it("preview returns diff for field merges into existing types", async () => {
    const existingTask = makeRecordType("task", {
      schema: { fields: [{ name: "title", type: "string", required: true }] },
    });
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingTask]);

    const pkg = makePkg({
      recordTypes: [
        { key: "task", fields: [{ name: "priority", type: "number" }] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, { previewOnly: true });

    expect(result.success).toBe(true);
    expect(result.diff.modifiedRecordTypes).toHaveLength(1);
    expect(result.diff.modifiedRecordTypes[0].recordTypeKey).toBe("task");
    expect(result.diff.modifiedRecordTypes[0].fieldAdds).toEqual(["priority"]);
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
  });

  it("no-op when package matches existing state exactly", async () => {
    const existingTask = makeRecordType("task", {
      schema: { fields: [{ name: "title", type: "string", required: true }] },
    });
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingTask]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(existingTask);

    const pkg = makePkg({
      recordTypes: [
        { key: "task", fields: [{ name: "title", type: "string" }] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(0);
    expect(result.diff.modifiedRecordTypes).toEqual([]);
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.package_installed" }),
    );
  });
});

// --- Idempotency + version guard ---

describe("installGraphPackage — idempotency and versioning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
  });

  it("returns noop when checksum matches latest install", async () => {
    const pkg = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });
    const checksum = computePackageChecksum(pkg);

    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      id: "gpi-existing",
      packageKey: "test-pkg",
      version: "1.0.0",
      checksum,
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(result.noop).toBe(true);
    expect(result.appliedCount).toBe(0);
    expect(result.reason).toContain("already installed");
    expect(mockTenantStorage.listRecordTypes).not.toHaveBeenCalled();
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.package_install_noop" }),
    );
  });

  it("rejects version downgrade by default", async () => {
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      id: "gpi-existing",
      packageKey: "test-pkg",
      version: "2.0.0",
      checksum: "different-checksum",
    });

    const pkg = makePkg({
      version: "1.5.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain("lower than installed");
    expect(mockTenantStorage.listRecordTypes).not.toHaveBeenCalled();
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ type: "graph.package_install_rejected" }),
    );
  });

  it("allows version downgrade when allowDowngrade is true", async () => {
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      id: "gpi-existing",
      packageKey: "test-pkg",
      version: "2.0.0",
      checksum: "different-checksum",
    });

    setupDynamicCreateMock();

    const pkg = makePkg({
      version: "1.5.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, { allowDowngrade: true });

    expect(result.success).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.appliedCount).toBe(1);
    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
  });

  it("audit row contains diff and package contents", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });

    await installGraphPackage(ctx, "proj-1", pkg);

    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    const auditRow = mockTenantStorage.createGraphPackageInstall.mock.calls[0][0];
    expect(auditRow.diff).toHaveProperty("addedRecordTypes");
    expect(auditRow.packageContents).toHaveProperty("recordTypes");
    expect(auditRow.packageContents.packageKey).toBe("test-pkg");
    expect(auditRow.packageContents.version).toBe("1.0.0");
    expect(auditRow.installedBy).toBe("user-1");
  });
});

// --- Ownership conflict ---

describe("installGraphPackage — ownership conflict", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
  });

  it("rejects when modifying a type owned by another package", async () => {
    // hr.lite previously installed with "person" type
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "person", fields: [] }],
        },
      },
    ]);

    // A different package tries to mutate "person"
    const pkg = makePkg({
      packageKey: "payroll",
      recordTypes: [
        { key: "person", fields: [{ name: "salary", type: "number" }] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(false);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0].code).toBe("PACKAGE_OWNERSHIP_CONFLICT");
    expect(result.validationErrors[0].message).toContain("hr.lite");
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
  });

  it("allows foreign type mutation with allowForeignTypeMutation", async () => {
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "person", fields: [{ name: "first_name", type: "string" }] }],
        },
      },
    ]);

    const existingPerson = makeRecordType("person", {
      schema: { fields: [{ name: "first_name", type: "string", required: true }] },
    });
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingPerson]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(existingPerson);
    mockTenantStorage.updateRecordTypeSchema.mockResolvedValue({ ...existingPerson });

    const pkg = makePkg({
      packageKey: "payroll",
      recordTypes: [
        { key: "person", fields: [{ name: "salary", type: "number" }] },
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, {
      allowForeignTypeMutation: true,
    });

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
  });

  it("allows same package to modify its own types", async () => {
    // hr.lite previously installed with "person"
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "person", fields: [{ name: "first_name", type: "string" }] }],
        },
      },
    ]);

    const existingPerson = makeRecordType("person", {
      schema: { fields: [{ name: "first_name", type: "string", required: true }] },
    });
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingPerson]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(existingPerson);
    mockTenantStorage.updateRecordTypeSchema.mockResolvedValue({ ...existingPerson });

    // hr.lite v0.2.0 adds a field to its own "person" type
    const pkg = makePkg({
      packageKey: "hr.lite",
      version: "0.2.0",
      recordTypes: [
        { key: "person", fields: [
          { name: "first_name", type: "string" },
          { name: "middle_name", type: "string" },
        ]},
      ],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
  });
});

// --- HR Lite built-in package ---

describe("hrLitePackage — built-in package", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "HR Case Triage" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("has expected shape", () => {
    expect(hrLitePackage.packageKey).toBe("hr.lite");
    expect(hrLitePackage.version).toBe("0.2.0");
    expect(hrLitePackage.recordTypes).toHaveLength(4);
    expect(hrLitePackage.recordTypes.map((rt) => rt.key).sort()).toEqual([
      "department",
      "employee",
      "hr_case",
      "person",
    ]);
    // employee extends person
    const employee = hrLitePackage.recordTypes.find((rt) => rt.key === "employee");
    expect(employee?.baseType).toBe("person");
    // bindings present
    expect(hrLitePackage.slaPolicies).toHaveLength(1);
    expect(hrLitePackage.assignmentRules).toHaveLength(1);
    expect(hrLitePackage.workflows).toHaveLength(1);
  });

  it("preview returns non-empty diff on empty tenant", async () => {
    const result = await installGraphPackage(ctx, "proj-1", hrLitePackage, {
      previewOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.diff.addedRecordTypes.length).toBe(4);
    expect(result.diff.addedRecordTypes.map((r) => r.key).sort()).toEqual([
      "department",
      "employee",
      "hr_case",
      "person",
    ]);
    // No mutations in preview
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
  });

  it("installs and writes audit row", async () => {
    setupDynamicCreateMock();

    const result = await installGraphPackage(ctx, "proj-1", hrLitePackage);

    expect(result.success).toBe(true);
    // 4 record types + 1 SLA + 1 assignment + 1 workflow = 7
    expect(result.appliedCount).toBe(7);

    // person created before employee (topological order)
    const createCalls = mockTenantStorage.createRecordType.mock.calls;
    const keys = createCalls.map((c) => c[0].key);
    expect(keys.indexOf("person")).toBeLessThan(keys.indexOf("employee"));

    // Audit trail
    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    const auditRow = mockTenantStorage.createGraphPackageInstall.mock.calls[0][0];
    expect(auditRow.packageKey).toBe("hr.lite");
    expect(auditRow.version).toBe("0.2.0");
  });

  it("re-install returns noop", async () => {
    const checksum = computePackageChecksum(hrLitePackage);
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue({
      id: "gpi-existing",
      packageKey: "hr.lite",
      version: "0.2.0",
      checksum,
    });

    const result = await installGraphPackage(ctx, "proj-1", hrLitePackage);

    expect(result.success).toBe(true);
    expect(result.noop).toBe(true);
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.createGraphPackageInstall).not.toHaveBeenCalled();
  });
});

// --- Multi-package orchestration ---

describe("installGraphPackages — batch orchestration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
  });

  it("installs multiple packages in dependency order", async () => {
    setupDynamicCreateMock();

    // Track audit rows so ownership check + getLatestGraphPackageInstall are dynamic
    const auditRows: Array<{ packageKey: string; version: string; checksum: string; packageContents: unknown }> = [];
    mockTenantStorage.createGraphPackageInstall.mockImplementation(async (data) => {
      auditRows.push(data);
      return { id: `gpi-${auditRows.length}` };
    });
    mockTenantStorage.listGraphPackageInstalls.mockImplementation(async () => {
      return [...auditRows].reverse();
    });
    mockTenantStorage.getLatestGraphPackageInstall.mockImplementation(async (_projId: string, pkgKey: string) => {
      return auditRows.filter((r) => r.packageKey === pkgKey).pop() ?? null;
    });

    const base = makePkg({
      packageKey: "core",
      version: "1.0.0",
      recordTypes: [{ key: "task", fields: [{ name: "title", type: "string" }] }],
    });
    const ext = makePkg({
      packageKey: "ext",
      version: "1.0.0",
      dependsOn: [{ packageKey: "core" }],
      recordTypes: [
        { key: "incident", baseType: "task", fields: [{ name: "severity", type: "choice" }] },
      ],
    });

    // Pass ext first — orchestrator should install core first via topo sort
    const result = await installGraphPackages(ctx, "proj-1", [ext, base]);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].packageKey).toBe("core");
    expect(result.results[0].result.success).toBe(true);
    expect(result.results[1].packageKey).toBe("ext");
    expect(result.results[1].result.success).toBe(true);
  });

  it("stops on first failure", async () => {
    // First package will fail validation (orphan baseType)
    const bad = makePkg({
      packageKey: "bad",
      recordTypes: [
        { key: "incident", baseType: "nonexistent", fields: [] },
      ],
    });
    const good = makePkg({
      packageKey: "good",
      dependsOn: [{ packageKey: "bad" }],
      recordTypes: [{ key: "task", fields: [] }],
    });

    const result = await installGraphPackages(ctx, "proj-1", [good, bad]);

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1); // stopped after "bad"
    expect(result.results[0].packageKey).toBe("bad");
    expect(result.results[0].result.success).toBe(false);
  });
});

// --- Binding projection ---

describe("projectPackageOntoSnapshot — binding projection", () => {
  function makeSnapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
    return {
      tenantId: "t-1",
      builtAt: new Date().toISOString(),
      nodes: [],
      fields: [],
      edges: [],
      bindings: { workflows: [], slas: [], assignments: [], changePolicies: [] },
      ...overrides,
    };
  }

  function makeNode(key: string): RecordTypeNode {
    return {
      id: `rt-${key}`,
      type: "record_type",
      tenantId: "t-1",
      version: 1,
      key,
      baseType: null,
      status: "active",
      projectId: "proj-1",
    };
  }

  it("projects SLA bindings onto snapshot", () => {
    const current = makeSnapshot({ nodes: [makeNode("hr_case")] });
    const pkg = makePkg({
      recordTypes: [],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 1440 }],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.bindings.slas).toHaveLength(1);
    expect(projected.bindings.slas[0]).toEqual({
      recordTypeKey: "hr_case",
      durationMinutes: 1440,
    });
  });

  it("does not duplicate existing SLA bindings", () => {
    const current = makeSnapshot({
      nodes: [makeNode("hr_case")],
      bindings: {
        workflows: [],
        slas: [{ recordTypeKey: "hr_case", durationMinutes: 720 }],
        assignments: [],
        changePolicies: [],
      },
    });
    const pkg = makePkg({
      recordTypes: [],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 1440 }],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.bindings.slas).toHaveLength(1);
    expect(projected.bindings.slas[0].durationMinutes).toBe(720); // original preserved
  });

  it("projects assignment bindings onto snapshot", () => {
    const current = makeSnapshot({ nodes: [makeNode("hr_case")] });
    const pkg = makePkg({
      recordTypes: [],
      assignmentRules: [{ recordTypeKey: "hr_case", strategyType: "static_group" }],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.bindings.assignments).toHaveLength(1);
    expect(projected.bindings.assignments[0]).toEqual({
      recordTypeKey: "hr_case",
      strategyType: "static_group",
    });
  });

  it("projects workflow bindings with synthetic IDs", () => {
    const current = makeSnapshot({ nodes: [makeNode("hr_case")] });
    const pkg = makePkg({
      recordTypes: [],
      workflows: [{
        key: "triage",
        name: "HR Triage",
        recordTypeKey: "hr_case",
        triggerEvent: "record_created",
      }],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.bindings.workflows).toHaveLength(1);
    expect(projected.bindings.workflows[0]).toEqual({
      workflowId: "pkg-wf-triage",
      workflowName: "HR Triage",
      recordTypeKey: "hr_case",
      triggerType: "record_event",
    });
  });

  it("projects all binding types together with record types", () => {
    const current = makeSnapshot();
    const pkg = makePkg({
      recordTypes: [
        { key: "hr_case", fields: [{ name: "subject", type: "string" }] },
      ],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 1440 }],
      assignmentRules: [{ recordTypeKey: "hr_case", strategyType: "static_group" }],
      workflows: [{
        key: "triage",
        name: "HR Triage",
        recordTypeKey: "hr_case",
      }],
    });

    const projected = projectPackageOntoSnapshot(current, pkg, "proj-1", "t-1");

    expect(projected.nodes).toHaveLength(1);
    expect(projected.bindings.slas).toHaveLength(1);
    expect(projected.bindings.assignments).toHaveLength(1);
    expect(projected.bindings.workflows).toHaveLength(1);
  });
});

// --- Binding apply ---

describe("installGraphPackage — binding apply", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "test" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("applies SLA config to record type", async () => {
    const hrCase = makeRecordType("hr_case");
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [
        { key: "hr_case", fields: [{ name: "subject", type: "string" }] },
      ],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 1440 }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    // 1 for record type + 1 for SLA config
    expect(result.appliedCount).toBe(2);
    expect(mockTenantStorage.updateRecordTypeSlaConfig).toHaveBeenCalledOnce();
    const [rtId, config] = mockTenantStorage.updateRecordTypeSlaConfig.mock.calls[0];
    expect(rtId).toBe("rt-hr_case");
    expect(config).toEqual({ durationMinutes: 1440 });
  });

  it("applies assignment config to record type", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [
        { key: "hr_case", fields: [{ name: "subject", type: "string" }] },
      ],
      assignmentRules: [{
        recordTypeKey: "hr_case",
        strategyType: "static_group",
        config: { groupKey: "hr_ops" },
      }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(mockTenantStorage.updateRecordTypeAssignmentConfig).toHaveBeenCalledOnce();
    const [rtId, config] = mockTenantStorage.updateRecordTypeAssignmentConfig.mock.calls[0];
    expect(rtId).toBe("rt-hr_case");
    expect(config).toEqual({ type: "static_group", groupKey: "hr_ops" });
  });

  it("creates workflow definition, trigger, and steps", async () => {
    setupDynamicCreateMock();

    const pkg = makePkg({
      recordTypes: [
        { key: "hr_case", fields: [{ name: "subject", type: "string" }] },
      ],
      workflows: [{
        key: "triage",
        name: "HR Case Triage",
        recordTypeKey: "hr_case",
        triggerEvent: "record_created",
        steps: [
          { name: "Auto-assign", stepType: "assignment", config: { target: "hr_ops" }, ordering: 1 },
          { name: "Notify", stepType: "notification", config: { template: "opened" }, ordering: 2 },
        ],
      }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(mockTenantStorage.createWorkflowDefinition).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createWorkflowDefinition.mock.calls[0][0]).toEqual({
      name: "HR Case Triage",
      triggerType: "record_event",
      triggerConfig: { recordType: "hr_case", event: "record_created" },
      version: 1,
    });
    expect(mockTenantStorage.updateWorkflowDefinitionStatus).toHaveBeenCalledWith("wf-1", "active");
    expect(mockTenantStorage.createWorkflowTrigger).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createWorkflowStep).toHaveBeenCalledTimes(2);
    expect(mockTenantStorage.createWorkflowStep.mock.calls[0][0].stepType).toBe("assignment");
    expect(mockTenantStorage.createWorkflowStep.mock.calls[1][0].stepType).toBe("notification");
  });

  it("skips workflow creation when workflow with same name exists", async () => {
    setupDynamicCreateMock();
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([
      { id: "wf-existing", name: "HR Case Triage", status: "active" },
    ]);

    const pkg = makePkg({
      recordTypes: [
        { key: "hr_case", fields: [{ name: "subject", type: "string" }] },
      ],
      workflows: [{
        key: "triage",
        name: "HR Case Triage",
        recordTypeKey: "hr_case",
      }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(mockTenantStorage.createWorkflowDefinition).not.toHaveBeenCalled();
    expect(mockTenantStorage.createWorkflowTrigger).not.toHaveBeenCalled();
  });

  it("preview shows binding diffs without mutations", async () => {
    const pkg = makePkg({
      recordTypes: [
        { key: "hr_case", fields: [{ name: "subject", type: "string" }] },
      ],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 1440 }],
      assignmentRules: [{ recordTypeKey: "hr_case", strategyType: "static_group" }],
      workflows: [{
        key: "triage",
        name: "HR Triage",
        recordTypeKey: "hr_case",
      }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, { previewOnly: true });

    expect(result.success).toBe(true);
    expect(result.diff.bindingChanges.slasAdded).toHaveLength(1);
    expect(result.diff.bindingChanges.slasAdded[0]).toBe("hr_case");
    expect(result.diff.bindingChanges.assignmentsAdded).toHaveLength(1);
    expect(result.diff.bindingChanges.assignmentsAdded[0]).toBe("hr_case:static_group");
    expect(result.diff.bindingChanges.workflowsAdded).toHaveLength(1);

    // No mutations
    expect(mockTenantStorage.updateRecordTypeSlaConfig).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateRecordTypeAssignmentConfig).not.toHaveBeenCalled();
    expect(mockTenantStorage.createWorkflowDefinition).not.toHaveBeenCalled();
  });
});

// --- Binding ownership conflict ---

describe("installGraphPackage — binding ownership conflict", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
  });

  it("rejects binding to a type owned by another package", async () => {
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "hr_case", fields: [] }],
        },
      },
    ]);

    const pkg = makePkg({
      packageKey: "monitoring",
      recordTypes: [],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 60 }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(false);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0].code).toBe("PACKAGE_BINDING_OWNERSHIP_CONFLICT");
    expect(result.validationErrors[0].message).toContain("hr.lite");
  });

  it("allows binding to own record types", async () => {
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "hr_case", fields: [] }],
        },
      },
    ]);

    const existingHrCase = makeRecordType("hr_case");
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingHrCase]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(existingHrCase);
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({ ...existingHrCase });

    // Same package (hr.lite) adds SLA to its own type
    const pkg = makePkg({
      packageKey: "hr.lite",
      version: "0.2.0",
      recordTypes: [{ key: "hr_case", fields: [{ name: "subject", type: "string" }] }],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 1440 }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(true);
    expect(mockTenantStorage.updateRecordTypeSlaConfig).toHaveBeenCalledOnce();
  });

  it("allows binding with allowForeignTypeMutation", async () => {
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "hr_case", fields: [] }],
        },
      },
    ]);

    const existingHrCase = makeRecordType("hr_case");
    mockTenantStorage.listRecordTypes.mockResolvedValue([existingHrCase]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(existingHrCase);
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({ ...existingHrCase });

    const pkg = makePkg({
      packageKey: "monitoring",
      recordTypes: [],
      slaPolicies: [{ recordTypeKey: "hr_case", durationMinutes: 60 }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg, {
      allowForeignTypeMutation: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects workflow binding to a type owned by another package", async () => {
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([
      {
        id: "gpi-1",
        packageKey: "hr.lite",
        version: "0.1.0",
        checksum: "abc",
        installedAt: new Date(),
        packageContents: {
          recordTypes: [{ key: "hr_case", fields: [] }],
        },
      },
    ]);

    const pkg = makePkg({
      packageKey: "monitoring",
      recordTypes: [],
      workflows: [{
        key: "monitor_hr",
        name: "Monitor HR Cases",
        recordTypeKey: "hr_case",
      }],
    });

    const result = await installGraphPackage(ctx, "proj-1", pkg);

    expect(result.success).toBe(false);
    expect(result.validationErrors[0].code).toBe("PACKAGE_BINDING_OWNERSHIP_CONFLICT");
  });
});

// --- HR Lite with bindings ---

describe("hrLitePackage — bindings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.listRecordTypes.mockResolvedValue([]);
    mockTenantStorage.getWorkflowDefinitionsByTenant.mockResolvedValue([]);
    mockTenantStorage.getWorkflowTriggersByTenant.mockResolvedValue([]);
    mockTenantStorage.getProject.mockResolvedValue({ id: "proj-1", tenantId: "t-1" });
    mockTenantStorage.getLatestGraphPackageInstall.mockResolvedValue(null);
    mockTenantStorage.createGraphPackageInstall.mockResolvedValue({ id: "gpi-1" });
    mockTenantStorage.listGraphPackageInstalls.mockResolvedValue([]);
    mockTenantStorage.updateRecordTypeSlaConfig.mockResolvedValue({});
    mockTenantStorage.updateRecordTypeAssignmentConfig.mockResolvedValue({});
    mockTenantStorage.createWorkflowDefinition.mockResolvedValue({ id: "wf-1", name: "HR Case Triage" });
    mockTenantStorage.createWorkflowTrigger.mockResolvedValue({ id: "wt-1" });
    mockTenantStorage.createWorkflowStep.mockResolvedValue({ id: "ws-1" });
    mockTenantStorage.updateWorkflowDefinitionStatus.mockResolvedValue({});
  });

  it("has binding sections in v0.2.0", () => {
    expect(hrLitePackage.version).toBe("0.2.0");
    expect(hrLitePackage.slaPolicies).toHaveLength(1);
    expect(hrLitePackage.slaPolicies![0].recordTypeKey).toBe("hr_case");
    expect(hrLitePackage.slaPolicies![0].durationMinutes).toBe(1440);
    expect(hrLitePackage.assignmentRules).toHaveLength(1);
    expect(hrLitePackage.assignmentRules![0].strategyType).toBe("static_group");
    expect(hrLitePackage.workflows).toHaveLength(1);
    expect(hrLitePackage.workflows![0].key).toBe("hr_case_triage");
    expect(hrLitePackage.workflows![0].steps).toHaveLength(2);
  });

  it("preview shows binding diffs for full package", async () => {
    const result = await installGraphPackage(ctx, "proj-1", hrLitePackage, {
      previewOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.diff.addedRecordTypes).toHaveLength(4);
    expect(result.diff.bindingChanges.slasAdded).toContain("hr_case");
    expect(result.diff.bindingChanges.assignmentsAdded).toContain("hr_case:static_group");
    expect(result.diff.bindingChanges.workflowsAdded).toHaveLength(1);
    expect(mockTenantStorage.createRecordType).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateRecordTypeSlaConfig).not.toHaveBeenCalled();
  });

  it("installs record types and bindings together", async () => {
    setupDynamicCreateMock();

    const result = await installGraphPackage(ctx, "proj-1", hrLitePackage);

    expect(result.success).toBe(true);
    // 4 record types + 1 SLA + 1 assignment + 1 workflow = 7
    expect(result.appliedCount).toBe(7);

    // Record types created in topological order
    const createCalls = mockTenantStorage.createRecordType.mock.calls;
    const keys = createCalls.map((c) => c[0].key);
    expect(keys.indexOf("person")).toBeLessThan(keys.indexOf("employee"));

    // SLA config applied
    expect(mockTenantStorage.updateRecordTypeSlaConfig).toHaveBeenCalledOnce();
    const [slaRtId, slaConfig] = mockTenantStorage.updateRecordTypeSlaConfig.mock.calls[0];
    expect(slaRtId).toBe("rt-hr_case");
    expect(slaConfig).toEqual({ durationMinutes: 1440 });

    // Assignment config applied
    expect(mockTenantStorage.updateRecordTypeAssignmentConfig).toHaveBeenCalledOnce();
    const [assignRtId, assignConfig] = mockTenantStorage.updateRecordTypeAssignmentConfig.mock.calls[0];
    expect(assignRtId).toBe("rt-hr_case");
    expect(assignConfig).toEqual({ type: "static_group", groupKey: "hr_ops" });

    // Workflow created + activated
    expect(mockTenantStorage.createWorkflowDefinition).toHaveBeenCalledOnce();
    expect(mockTenantStorage.updateWorkflowDefinitionStatus).toHaveBeenCalledWith("wf-1", "active");
    expect(mockTenantStorage.createWorkflowTrigger).toHaveBeenCalledOnce();
    expect(mockTenantStorage.createWorkflowStep).toHaveBeenCalledTimes(2);

    // Audit trail
    expect(mockTenantStorage.createGraphPackageInstall).toHaveBeenCalledOnce();
    const auditRow = mockTenantStorage.createGraphPackageInstall.mock.calls[0][0];
    expect(auditRow.packageKey).toBe("hr.lite");
    expect(auditRow.version).toBe("0.2.0");
  });

  it("checksum includes bindings", () => {
    // Verify that adding bindings changes the checksum
    const withoutBindings: GraphPackage = {
      ...hrLitePackage,
      slaPolicies: undefined,
      assignmentRules: undefined,
      workflows: undefined,
    };
    const checksumWithBindings = computePackageChecksum(hrLitePackage);
    const checksumWithout = computePackageChecksum(withoutBindings);
    expect(checksumWithBindings).not.toBe(checksumWithout);
  });
});
