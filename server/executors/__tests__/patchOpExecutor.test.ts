import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { ChangePatchOp, ChangeRecord, ChangeTarget, RecordType } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  getChangePatchOpsByChange: vi.fn(),
  getChangeTarget: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  updateRecordTypeSchema: vi.fn(),
  updateChangePatchOpSnapshot: vi.fn(),
  createRecordTypeSnapshot: vi.fn(),
  getSnapshotByChangeAndKey: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { executeChange, PatchOpExecutionError } from "../patchOpExecutor";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Fix bug",
  description: null,
  status: "Implementing",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const fakeRecordType: RecordType = {
  id: "rt-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  name: "Task",
  key: "task",
  description: "A task",
  baseType: null,
  schema: {
    fields: [
      { name: "title", type: "string", required: true },
      { name: "status", type: "choice", required: true },
    ],
  },
  version: 1,
  status: "active",
  createdAt: new Date(),
};

const fakeTarget: ChangeTarget = {
  id: "ct-rt",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "record_type",
  selector: { recordTypeId: "rt-1" },
  createdAt: new Date(),
};

function makeSetFieldOp(overrides: Partial<ChangePatchOp> = {}): ChangePatchOp {
  return {
    id: "po-1",
    tenantId: "tenant-a",
    changeId: "change-1",
    targetId: "ct-rt",
    opType: "set_field",
    payload: {
      recordType: "task",
      field: "severity",
      definition: { type: "choice", required: true, options: ["low", "medium", "high"] },
    },
    previousSnapshot: null,
    executedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setupDefaults() {
  mockTenantStorage.getChange.mockResolvedValue(fakeChange);
  mockTenantStorage.getChangeTarget.mockResolvedValue(fakeTarget);
  mockTenantStorage.getSnapshotByChangeAndKey.mockResolvedValue(undefined);
  mockTenantStorage.createRecordTypeSnapshot.mockResolvedValue({});
}

describe("patchOpExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("state guards", () => {
    it("throws if change not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);

      await expect(executeChange(ctx, "no-change")).rejects.toThrow("Change not found");
    });

    it("throws if change is not in Implementing state", async () => {
      mockTenantStorage.getChange.mockResolvedValue({ ...fakeChange, status: "Draft" });

      await expect(executeChange(ctx, "change-1")).rejects.toThrow(
        /must be in "Implementing" state/,
      );
    });

    it("throws if no patch ops exist", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);

      await expect(executeChange(ctx, "change-1")).rejects.toThrow(
        "No patch ops to execute",
      );
    });
  });

  describe("executeChange", () => {
    it("executes a single set_field op and creates a snapshot", async () => {
      setupDefaults();
      const op = makeSetFieldOp();
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockResolvedValue({
        ...fakeRecordType,
        schema: {
          fields: [
            ...((fakeRecordType.schema as any).fields),
            { name: "severity", type: "choice", required: true },
          ],
        },
      });
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue(op);

      const result = await executeChange(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 1 });
      expect(mockTenantStorage.createRecordTypeSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          recordTypeKey: "task",
          changeId: "change-1",
          schema: fakeRecordType.schema,
        }),
      );
    });

    it("creates snapshot only once per recordType per change", async () => {
      setupDefaults();
      const op1 = makeSetFieldOp({ id: "po-1" });
      const op2 = makeSetFieldOp({
        id: "po-2",
        payload: { recordType: "task", field: "priority", definition: { type: "number" } },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 2 });
      // Snapshot created only once for "task"
      expect(mockTenantStorage.createRecordTypeSnapshot).toHaveBeenCalledTimes(1);
    });

    it("replaces an existing field when field name matches", async () => {
      setupDefaults();
      const op = makeSetFieldOp({
        payload: {
          recordType: "task",
          field: "title",
          definition: { type: "text", required: false },
        },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue(op);

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      const calledSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      const titleField = calledSchema.fields.find((f: any) => f.name === "title");
      expect(titleField).toEqual({ name: "title", type: "text", required: false });
    });

    it("rolls back all applied ops when one fails mid-batch", async () => {
      setupDefaults();
      const op1 = makeSetFieldOp({ id: "po-1" });
      const op2 = makeSetFieldOp({
        id: "po-2",
        payload: {
          recordType: "nonexistent",
          field: "x",
          definition: { type: "string" },
        },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(fakeRecordType) // op1 lookup
        .mockResolvedValueOnce(undefined); // op2 lookup — fails
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(0);
      expect(result.error).toContain("po-2");
      expect(result.error).toContain("nonexistent");
      // 1 apply + 1 rollback = 2 calls
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(2);
    });

    it("returns failure when record type not found", async () => {
      setupDefaults();
      const op = makeSetFieldOp();
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("handles record type with null schema", async () => {
      setupDefaults();
      const op = makeSetFieldOp();
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue({
        ...fakeRecordType,
        schema: null,
      });
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue(op);

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      const calledSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(calledSchema.fields).toHaveLength(1);
      expect(calledSchema.fields[0].name).toBe("severity");
    });

    it("fails if target type is not record_type", async () => {
      setupDefaults();
      const op = makeSetFieldOp();
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getChangeTarget.mockResolvedValue({
        ...fakeTarget,
        type: "file",
      });

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be type "record_type"');
    });

    it("rolls back in reverse order across different record types", async () => {
      setupDefaults();
      const rt1: RecordType = { ...fakeRecordType, id: "rt-1", key: "task" };
      const rt2: RecordType = {
        ...fakeRecordType,
        id: "rt-2",
        key: "incident",
        schema: { fields: [{ name: "severity", type: "choice" }] },
      };
      const target2: ChangeTarget = { ...fakeTarget, id: "ct-rt2" };
      const op1 = makeSetFieldOp({
        id: "po-1",
        payload: { recordType: "task", field: "newField", definition: { type: "string" } },
      });
      const op2 = makeSetFieldOp({
        id: "po-2",
        targetId: "ct-rt2",
        payload: { recordType: "incident", field: "impact", definition: { type: "string" } },
      });
      const op3 = makeSetFieldOp({
        id: "po-3",
        payload: { recordType: "missing", field: "x", definition: { type: "string" } },
      });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2, op3]);
      mockTenantStorage.getChangeTarget
        .mockResolvedValueOnce(fakeTarget) // op1
        .mockResolvedValueOnce(target2) // op2
        .mockResolvedValueOnce(fakeTarget); // op3
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(rt1) // op1
        .mockResolvedValueOnce(rt2) // op2
        .mockResolvedValueOnce(undefined); // op3 fails
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      // 2 applies + 2 rollbacks = 4 calls
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(4);
      const rollbackCalls = mockTenantStorage.updateRecordTypeSchema.mock.calls.slice(2);
      expect(rollbackCalls[0][0]).toBe("rt-2"); // reverse order
      expect(rollbackCalls[1][0]).toBe("rt-1");
    });

    it("rejects weakening a required baseType field", async () => {
      setupDefaults();
      const baseTask: RecordType = {
        ...fakeRecordType,
        id: "rt-base",
        key: "task",
        schema: {
          fields: [
            { name: "state", type: "choice", required: true },
            { name: "short_description", type: "string", required: true },
          ],
        },
      };
      const incident: RecordType = {
        ...fakeRecordType,
        id: "rt-inc",
        key: "incident",
        baseType: "task",
        schema: { fields: [{ name: "severity", type: "choice", required: true }] },
      };

      const op = makeSetFieldOp({
        payload: {
          recordType: "incident",
          field: "state",
          definition: { type: "choice", required: false },
        },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incident) // main lookup
        .mockResolvedValueOnce(baseTask); // baseType lookup

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot weaken required baseType field");
      expect(result.error).toContain("state");
    });

    it("allows adding a new field to a type with baseType", async () => {
      setupDefaults();
      const baseTask: RecordType = {
        ...fakeRecordType,
        id: "rt-base",
        key: "task",
        schema: {
          fields: [{ name: "state", type: "choice", required: true }],
        },
      };
      const incident: RecordType = {
        ...fakeRecordType,
        id: "rt-inc",
        key: "incident",
        baseType: "task",
        schema: { fields: [{ name: "severity", type: "choice", required: true }] },
      };

      const op = makeSetFieldOp({
        payload: {
          recordType: "incident",
          field: "new_field",
          definition: { type: "string", required: false },
        },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incident) // main lookup
        .mockResolvedValueOnce(baseTask); // baseType lookup
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...incident, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
    });
  });
});
