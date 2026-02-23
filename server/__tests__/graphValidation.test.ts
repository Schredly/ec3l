import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { ChangePatchOp, ChangeRecord, ChangeTarget, RecordType } from "@shared/schema";

// --- Pure validation unit tests ---

import {
  validateNoOrphanRecordTypes,
  validateNoCyclesInBaseType,
  validateFieldUniquenessPerRecordType,
  validateBindingTargetsExist,
  validateBaseTypeSameProject,
  validateGraphSnapshot,
} from "../graph/graphValidationService";
import type { GraphSnapshot, RecordTypeNode, FieldDefinitionNode } from "../graph/graphContracts";
import { diffGraphSnapshots } from "../graph/graphDiffService";

function makeSnapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return {
    tenantId: "t-1",
    builtAt: new Date().toISOString(),
    nodes: [],
    fields: [],
    edges: [],
    bindings: {
      workflows: [],
      slas: [],
      assignments: [],
      changePolicies: [],
    },
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

describe("graphValidationService — pure validators", () => {
  describe("validateNoOrphanRecordTypes", () => {
    it("returns no errors when all baseType references resolve", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("task"),
          makeNode("incident", { baseType: "task" }),
        ],
      });
      expect(validateNoOrphanRecordTypes(snapshot)).toEqual([]);
    });

    it("returns error when baseType does not exist", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("incident", { baseType: "nonexistent" }),
        ],
      });
      const errors = validateNoOrphanRecordTypes(snapshot);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("ORPHAN_BASE_TYPE");
      expect(errors[0].message).toContain("nonexistent");
      expect(errors[0].nodeKey).toBe("incident");
    });

    it("returns no errors when no baseTypes are declared", () => {
      const snapshot = makeSnapshot({
        nodes: [makeNode("task"), makeNode("incident")],
      });
      expect(validateNoOrphanRecordTypes(snapshot)).toEqual([]);
    });

    it("returns errors for multiple orphaned baseTypes", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("incident", { baseType: "ghost_a" }),
          makeNode("problem", { baseType: "ghost_b" }),
        ],
      });
      const errors = validateNoOrphanRecordTypes(snapshot);
      expect(errors).toHaveLength(2);
    });
  });

  describe("validateNoCyclesInBaseType", () => {
    it("returns no errors for a linear chain", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("base"),
          makeNode("task", { baseType: "base" }),
          makeNode("incident", { baseType: "task" }),
        ],
      });
      expect(validateNoCyclesInBaseType(snapshot)).toEqual([]);
    });

    it("detects a simple 2-node cycle", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("a", { baseType: "b" }),
          makeNode("b", { baseType: "a" }),
        ],
      });
      const errors = validateNoCyclesInBaseType(snapshot);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].code).toBe("BASE_TYPE_CYCLE");
    });

    it("detects a 3-node cycle", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("a", { baseType: "b" }),
          makeNode("b", { baseType: "c" }),
          makeNode("c", { baseType: "a" }),
        ],
      });
      const errors = validateNoCyclesInBaseType(snapshot);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.code === "BASE_TYPE_CYCLE")).toBe(true);
    });

    it("returns no errors when there are no baseTypes", () => {
      const snapshot = makeSnapshot({
        nodes: [makeNode("a"), makeNode("b")],
      });
      expect(validateNoCyclesInBaseType(snapshot)).toEqual([]);
    });

    it("does not false-positive for a diamond inheritance (no cycle)", () => {
      // base → taskA → incident
      // base → taskB → incident (this is NOT possible with single baseType, just test the chain)
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("base"),
          makeNode("taskA", { baseType: "base" }),
          makeNode("incident", { baseType: "taskA" }),
        ],
      });
      expect(validateNoCyclesInBaseType(snapshot)).toEqual([]);
    });
  });

  describe("validateFieldUniquenessPerRecordType", () => {
    it("returns no errors for unique fields", () => {
      const fields: FieldDefinitionNode[] = [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "task", name: "status", fieldType: "choice", required: false },
      ];
      expect(validateFieldUniquenessPerRecordType(fields)).toEqual([]);
    });

    it("detects duplicate field names on the same record type", () => {
      const fields: FieldDefinitionNode[] = [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "task", name: "title", fieldType: "text", required: false },
      ];
      const errors = validateFieldUniquenessPerRecordType(fields);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("DUPLICATE_FIELD");
      expect(errors[0].nodeKey).toBe("task");
      expect(errors[0].field).toBe("title");
    });

    it("allows same field name on different record types", () => {
      const fields: FieldDefinitionNode[] = [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "incident", name: "title", fieldType: "string", required: true },
      ];
      expect(validateFieldUniquenessPerRecordType(fields)).toEqual([]);
    });
  });

  describe("validateBindingTargetsExist", () => {
    it("returns no errors when all bindings target existing nodes", () => {
      const snapshot = makeSnapshot({
        nodes: [makeNode("incident")],
        bindings: {
          workflows: [{ workflowId: "wf-1", workflowName: "Approval", recordTypeKey: "incident", triggerType: "record_event" }],
          slas: [{ recordTypeKey: "incident", durationMinutes: 60 }],
          assignments: [{ recordTypeKey: "incident", strategyType: "static_user" }],
          changePolicies: [],
        },
      });
      expect(validateBindingTargetsExist(snapshot)).toEqual([]);
    });

    it("returns error for workflow binding to non-existent record type", () => {
      const snapshot = makeSnapshot({
        nodes: [makeNode("task")],
        bindings: {
          workflows: [{ workflowId: "wf-1", workflowName: "Approval", recordTypeKey: "ghost", triggerType: "record_event" }],
          slas: [],
          assignments: [],
          changePolicies: [],
        },
      });
      const errors = validateBindingTargetsExist(snapshot);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("BINDING_TARGET_MISSING");
      expect(errors[0].message).toContain("ghost");
    });

    it("returns error for SLA binding to non-existent record type", () => {
      const snapshot = makeSnapshot({
        nodes: [],
        bindings: {
          workflows: [],
          slas: [{ recordTypeKey: "ghost", durationMinutes: 30 }],
          assignments: [],
          changePolicies: [],
        },
      });
      const errors = validateBindingTargetsExist(snapshot);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("BINDING_TARGET_MISSING");
    });
  });

  describe("validateBaseTypeSameProject", () => {
    it("returns no errors when baseType is in the same project", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("task", { projectId: "proj-1" }),
          makeNode("incident", { baseType: "task", projectId: "proj-1" }),
        ],
      });
      expect(validateBaseTypeSameProject(snapshot)).toEqual([]);
    });

    it("returns error when baseType is in a different project", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("task", { projectId: "proj-1" }),
          makeNode("incident", { baseType: "task", projectId: "proj-2" }),
        ],
      });
      const errors = validateBaseTypeSameProject(snapshot);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("BASE_TYPE_CROSS_PROJECT");
      expect(errors[0].nodeKey).toBe("incident");
      expect(errors[0].baseTypeKey).toBe("task");
      expect(errors[0].recordTypeId).toBe("rt-incident");
      expect(errors[0].details).toEqual({
        sourceProjectId: "proj-2",
        targetProjectId: "proj-1",
      });
    });

    it("skips missing baseType (handled by orphan check)", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("incident", { baseType: "nonexistent", projectId: "proj-1" }),
        ],
      });
      // Should not error — orphan validator handles missing base types
      expect(validateBaseTypeSameProject(snapshot)).toEqual([]);
    });

    it("returns no errors when no baseTypes declared", () => {
      const snapshot = makeSnapshot({
        nodes: [makeNode("task"), makeNode("incident")],
      });
      expect(validateBaseTypeSameProject(snapshot)).toEqual([]);
    });
  });

  describe("enriched error fields", () => {
    it("orphan error includes recordTypeId and baseTypeKey", () => {
      const snapshot = makeSnapshot({
        nodes: [makeNode("incident", { baseType: "ghost" })],
      });
      const errors = validateNoOrphanRecordTypes(snapshot);
      expect(errors[0].recordTypeId).toBe("rt-incident");
      expect(errors[0].baseTypeKey).toBe("ghost");
    });

    it("cycle error includes recordTypeId and baseTypeKey", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("a", { baseType: "b" }),
          makeNode("b", { baseType: "a" }),
        ],
      });
      const errors = validateNoCyclesInBaseType(snapshot);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].recordTypeId).toBeDefined();
      expect(errors[0].baseTypeKey).toBeDefined();
    });

    it("duplicate field error includes details", () => {
      const fields: FieldDefinitionNode[] = [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "task", name: "title", fieldType: "text", required: false },
      ];
      const errors = validateFieldUniquenessPerRecordType(fields);
      expect(errors[0].details).toEqual({ fieldType: "text" });
    });
  });

  describe("validateGraphSnapshot (composite)", () => {
    it("returns empty for a valid graph", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("task"),
          makeNode("incident", { baseType: "task" }),
        ],
        fields: [
          { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
          { recordTypeKey: "incident", name: "severity", fieldType: "choice", required: false },
        ],
      });
      expect(validateGraphSnapshot(snapshot)).toEqual([]);
    });

    it("returns multiple errors for a broken graph", () => {
      const snapshot = makeSnapshot({
        nodes: [
          makeNode("a", { baseType: "b" }),
          makeNode("b", { baseType: "a" }),
        ],
        fields: [
          { recordTypeKey: "a", name: "x", fieldType: "string", required: false },
          { recordTypeKey: "a", name: "x", fieldType: "number", required: false },
        ],
        bindings: {
          workflows: [{ workflowId: "wf-1", workflowName: "Test", recordTypeKey: "ghost", triggerType: "record_event" }],
          slas: [],
          assignments: [],
          changePolicies: [],
        },
      });
      const errors = validateGraphSnapshot(snapshot);
      // Expect cycle errors + duplicate field + binding target missing
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// --- Integration tests: graph validation blocks merge ---

const mockTenantStorage = {
  getChange: vi.fn(),
  getChangePatchOpsByChange: vi.fn(),
  getChangeTarget: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  updateRecordTypeSchema: vi.fn(),
  updateChangePatchOpSnapshot: vi.fn(),
  createRecordTypeSnapshot: vi.fn(),
  getSnapshotByChangeAndKey: vi.fn(),
  listRecordTypes: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

import { executeChange } from "../executors/patchOpExecutor";
import { emitDomainEvent } from "../services/domainEventService";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Test",
  description: null,
  status: "Ready",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const fakeTarget: ChangeTarget = {
  id: "ct-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "record_type",
  selector: { recordTypeId: "rt-1" },
  createdAt: new Date(),
};

function makeOp(opType: string, payload: unknown, overrides: Partial<ChangePatchOp> = {}): ChangePatchOp {
  return {
    id: "po-1",
    tenantId: "tenant-a",
    changeId: "change-1",
    targetId: "ct-1",
    opType,
    payload,
    previousSnapshot: null,
    executedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("graph validation — merge boundary integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTenantStorage.getChange.mockResolvedValue(fakeChange);
    mockTenantStorage.getChangeTarget.mockResolvedValue(fakeTarget);
    mockTenantStorage.getSnapshotByChangeAndKey.mockResolvedValue(undefined);
    mockTenantStorage.createRecordTypeSnapshot.mockResolvedValue({});
  });

  it("blocks merge when baseType does not exist in tenant", async () => {
    // incident declares baseType "nonexistent" which doesn't exist
    const incident: RecordType = {
      id: "rt-inc",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Incident",
      key: "incident",
      description: null,
      baseType: "nonexistent",
      schema: { fields: [{ name: "severity", type: "choice" }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "incident",
      field: "new_field",
      definition: { type: "string" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(incident);
    // listRecordTypes returns only incident (no "nonexistent" type)
    mockTenantStorage.listRecordTypes.mockResolvedValue([incident]);

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Graph validation failed");
    expect(result.error).toContain("nonexistent");
    // No DB writes
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateChangePatchOpSnapshot).not.toHaveBeenCalled();
  });

  it("blocks merge when baseType creates a cycle", async () => {
    const rtA: RecordType = {
      id: "rt-a",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Type A",
      key: "type_a",
      description: null,
      baseType: "type_b",
      schema: { fields: [] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const rtB: RecordType = {
      id: "rt-b",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Type B",
      key: "type_b",
      description: null,
      baseType: "type_a",
      schema: { fields: [] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "type_a",
      field: "x",
      definition: { type: "string" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockImplementation(async (key: string) => {
      if (key === "type_a") return rtA;
      if (key === "type_b") return rtB;
      return undefined;
    });
    mockTenantStorage.listRecordTypes.mockResolvedValue([rtA, rtB]);

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Graph validation failed");
    expect(result.error).toContain("Circular inheritance");
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
  });

  it("emits graph.validation_failed domain event on failure", async () => {
    const incident: RecordType = {
      id: "rt-inc",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Incident",
      key: "incident",
      description: null,
      baseType: "ghost",
      schema: { fields: [] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "incident",
      field: "x",
      definition: { type: "string" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(incident);
    mockTenantStorage.listRecordTypes.mockResolvedValue([incident]);

    await executeChange(ctx, "change-1");

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "graph.validation_failed",
        status: "failed",
        entityId: "change-1",
      }),
    );
  });

  it("allows valid changes to proceed through graph validation", async () => {
    const task: RecordType = {
      id: "rt-task",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Task",
      key: "task",
      description: null,
      baseType: null,
      schema: { fields: [{ name: "title", type: "string", required: true }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "task",
      field: "priority",
      definition: { type: "number" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(task);
    mockTenantStorage.listRecordTypes.mockResolvedValue([task]);
    mockTenantStorage.updateRecordTypeSchema.mockImplementation(
      async (_id: string, schema: unknown) => ({ ...task, schema }),
    );
    mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    // Schema was actually written
    expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalled();
  });

  it("allows valid change with baseType to proceed", async () => {
    const task: RecordType = {
      id: "rt-task",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Task",
      key: "task",
      description: null,
      baseType: null,
      schema: { fields: [{ name: "title", type: "string", required: true }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const incident: RecordType = {
      id: "rt-inc",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Incident",
      key: "incident",
      description: null,
      baseType: "task",
      schema: { fields: [{ name: "severity", type: "choice" }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "incident",
      field: "impact",
      definition: { type: "string" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey
      .mockResolvedValueOnce(incident)  // main lookup
      .mockResolvedValueOnce(task);     // baseType lookup
    mockTenantStorage.listRecordTypes.mockResolvedValue([task, incident]);
    mockTenantStorage.updateRecordTypeSchema.mockImplementation(
      async (_id: string, schema: unknown) => ({ ...incident, schema }),
    );
    mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
  });

  it("blocks merge when baseType is in a different project", async () => {
    const task: RecordType = {
      id: "rt-task",
      tenantId: "tenant-a",
      projectId: "proj-other",
      name: "Task",
      key: "task",
      description: null,
      baseType: null,
      schema: { fields: [{ name: "title", type: "string", required: true }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const incident: RecordType = {
      id: "rt-inc",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Incident",
      key: "incident",
      description: null,
      baseType: "task",
      schema: { fields: [] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "incident",
      field: "severity",
      definition: { type: "choice" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey
      .mockResolvedValueOnce(incident)
      .mockResolvedValueOnce(task);
    // listRecordTypes returns ALL types in the tenant for graph validation
    mockTenantStorage.listRecordTypes.mockResolvedValue([task, incident]);

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Graph validation failed");
    expect(result.error).toContain("belongs to project");
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
  });

  it("emits graph.validation_succeeded on valid graph", async () => {
    const task: RecordType = {
      id: "rt-task",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Task",
      key: "task",
      description: null,
      baseType: null,
      schema: { fields: [{ name: "title", type: "string", required: true }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "task",
      field: "priority",
      definition: { type: "number" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(task);
    mockTenantStorage.listRecordTypes.mockResolvedValue([task]);
    mockTenantStorage.updateRecordTypeSchema.mockImplementation(
      async (_id: string, schema: unknown) => ({ ...task, schema }),
    );
    mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(true);
    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "graph.validation_succeeded",
        status: "completed",
        entityId: "change-1",
      }),
    );
  });

  it("zero DB writes when graph validation fails", async () => {
    const orphan: RecordType = {
      id: "rt-orphan",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Orphan",
      key: "orphan",
      description: null,
      baseType: "does_not_exist",
      schema: { fields: [] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "orphan",
      field: "x",
      definition: { type: "string" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(orphan);
    mockTenantStorage.listRecordTypes.mockResolvedValue([orphan]);

    const result = await executeChange(ctx, "change-1");

    expect(result.success).toBe(false);
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateChangePatchOpSnapshot).not.toHaveBeenCalled();
    expect(mockTenantStorage.createRecordTypeSnapshot).not.toHaveBeenCalled();
  });

  it("emits graph.diff_computed with diff data on successful merge", async () => {
    const task: RecordType = {
      id: "rt-task",
      tenantId: "tenant-a",
      projectId: "proj-1",
      name: "Task",
      key: "task",
      description: null,
      baseType: null,
      schema: { fields: [{ name: "title", type: "string", required: true }] },
      assignmentConfig: null,
      slaConfig: null,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    const op = makeOp("add_field", {
      recordType: "task",
      field: "priority",
      definition: { type: "number" },
    });

    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue(task);
    mockTenantStorage.listRecordTypes.mockResolvedValue([task]);
    mockTenantStorage.updateRecordTypeSchema.mockImplementation(
      async (_id: string, schema: unknown) => ({ ...task, schema }),
    );
    mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

    await executeChange(ctx, "change-1");

    expect(emitDomainEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        type: "graph.diff_computed",
        status: "completed",
        entityId: "change-1",
      }),
    );
  });
});

// --- Pure graph diff unit tests ---

describe("graphDiffService — diffGraphSnapshots", () => {
  it("detects field additions", () => {
    const before = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
      ],
    });
    const after = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "task", name: "priority", fieldType: "number", required: false },
      ],
    });

    const diff = diffGraphSnapshots(before, after);
    expect(diff.addedRecordTypes).toEqual([]);
    expect(diff.removedRecordTypes).toEqual([]);
    expect(diff.modifiedRecordTypes).toHaveLength(1);
    expect(diff.modifiedRecordTypes[0].recordTypeKey).toBe("task");
    expect(diff.modifiedRecordTypes[0].fieldAdds).toEqual(["priority"]);
    expect(diff.modifiedRecordTypes[0].fieldRemovals).toEqual([]);
  });

  it("detects field removals", () => {
    const before = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "task", name: "priority", fieldType: "number", required: false },
      ],
    });
    const after = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
      ],
    });

    const diff = diffGraphSnapshots(before, after);
    expect(diff.modifiedRecordTypes).toHaveLength(1);
    expect(diff.modifiedRecordTypes[0].fieldRemovals).toEqual(["priority"]);
    expect(diff.modifiedRecordTypes[0].fieldAdds).toEqual([]);
  });

  it("detects field type changes", () => {
    const before = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "priority", fieldType: "string", required: false },
      ],
    });
    const after = makeSnapshot({
      nodes: [makeNode("task")],
      fields: [
        { recordTypeKey: "task", name: "priority", fieldType: "number", required: false },
      ],
    });

    const diff = diffGraphSnapshots(before, after);
    expect(diff.modifiedRecordTypes).toHaveLength(1);
    expect(diff.modifiedRecordTypes[0].fieldTypeChanges).toEqual(["priority"]);
  });

  it("detects baseType changes", () => {
    const before = makeSnapshot({
      nodes: [
        makeNode("base"),
        makeNode("incident", { baseType: null }),
      ],
    });
    const after = makeSnapshot({
      nodes: [
        makeNode("base"),
        makeNode("incident", { baseType: "base" }),
      ],
    });

    const diff = diffGraphSnapshots(before, after);
    expect(diff.baseTypeChanges).toHaveLength(1);
    expect(diff.baseTypeChanges[0].recordTypeKey).toBe("incident");
    expect(diff.baseTypeChanges[0].before).toBeNull();
    expect(diff.baseTypeChanges[0].after).toBe("base");
  });

  it("detects record type additions and removals", () => {
    const before = makeSnapshot({
      nodes: [makeNode("task")],
    });
    const after = makeSnapshot({
      nodes: [makeNode("incident")],
    });

    const diff = diffGraphSnapshots(before, after);
    expect(diff.addedRecordTypes).toHaveLength(1);
    expect(diff.addedRecordTypes[0].key).toBe("incident");
    expect(diff.removedRecordTypes).toHaveLength(1);
    expect(diff.removedRecordTypes[0].key).toBe("task");
  });

  it("returns empty diff for identical snapshots", () => {
    const snapshot = makeSnapshot({
      nodes: [makeNode("task"), makeNode("incident", { baseType: "task" })],
      fields: [
        { recordTypeKey: "task", name: "title", fieldType: "string", required: true },
        { recordTypeKey: "incident", name: "severity", fieldType: "choice", required: false },
      ],
    });

    const diff = diffGraphSnapshots(snapshot, snapshot);
    expect(diff.addedRecordTypes).toEqual([]);
    expect(diff.removedRecordTypes).toEqual([]);
    expect(diff.modifiedRecordTypes).toEqual([]);
    expect(diff.baseTypeChanges).toEqual([]);
    expect(diff.bindingChanges.workflowsAdded).toEqual([]);
    expect(diff.bindingChanges.workflowsRemoved).toEqual([]);
  });

  it("detects binding changes", () => {
    const before = makeSnapshot({
      nodes: [makeNode("task")],
      bindings: {
        workflows: [{ workflowId: "wf-1", workflowName: "Old", recordTypeKey: "task", triggerType: "record_event" }],
        slas: [],
        assignments: [],
        changePolicies: [],
      },
    });
    const after = makeSnapshot({
      nodes: [makeNode("task")],
      bindings: {
        workflows: [{ workflowId: "wf-2", workflowName: "New", recordTypeKey: "task", triggerType: "record_event" }],
        slas: [{ recordTypeKey: "task", durationMinutes: 60 }],
        assignments: [],
        changePolicies: [],
      },
    });

    const diff = diffGraphSnapshots(before, after);
    expect(diff.bindingChanges.workflowsAdded).toEqual(["wf-2:task"]);
    expect(diff.bindingChanges.workflowsRemoved).toEqual(["wf-1:task"]);
    expect(diff.bindingChanges.slasAdded).toEqual(["task"]);
  });
});
