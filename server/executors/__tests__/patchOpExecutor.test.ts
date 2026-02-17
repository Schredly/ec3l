import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { ChangePatchOp, RecordType } from "@shared/schema";

const mockTenantStorage = {
  getChangePatchOpsByChange: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  updateRecordTypeSchema: vi.fn(),
  updateChangePatchOpSnapshot: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { executePatchOps, PatchOpExecutionError } from "../patchOpExecutor";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

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

describe("patchOpExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executePatchOps", () => {
    it("returns success with 0 applied when no ops exist", async () => {
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);

      const result = await executePatchOps(ctx, "change-1");
      expect(result).toEqual({ success: true, appliedCount: 0 });
    });

    it("executes a single set_field op and adds a new field", async () => {
      const op = makeSetFieldOp();
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockResolvedValue({
        ...fakeRecordType,
        schema: {
          fields: [
            ...((fakeRecordType.schema as any).fields),
            { name: "severity", type: "choice", required: true, options: ["low", "medium", "high"] },
          ],
        },
      });
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue(op);

      const result = await executePatchOps(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 1 });
      expect(mockTenantStorage.getRecordTypeByKey).toHaveBeenCalledWith("task");
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledWith(
        "rt-1",
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "severity", type: "choice" }),
          ]),
        }),
      );
      expect(mockTenantStorage.updateChangePatchOpSnapshot).toHaveBeenCalledWith(
        "po-1",
        fakeRecordType.schema,
      );
    });

    it("replaces an existing field when field name matches", async () => {
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

      const result = await executePatchOps(ctx, "change-1");

      expect(result.success).toBe(true);
      const calledSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      const titleField = calledSchema.fields.find((f: any) => f.name === "title");
      expect(titleField).toEqual({ name: "title", type: "text", required: false });
    });

    it("executes multiple set_field ops in order", async () => {
      const op1 = makeSetFieldOp({ id: "po-1" });
      const op2 = makeSetFieldOp({
        id: "po-2",
        payload: {
          recordType: "task",
          field: "priority",
          definition: { type: "number", required: false },
        },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executePatchOps(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 2 });
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(2);
      expect(mockTenantStorage.updateChangePatchOpSnapshot).toHaveBeenCalledTimes(2);
    });

    it("rolls back all applied ops when one fails mid-batch", async () => {
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

      const result = await executePatchOps(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(0);
      expect(result.error).toContain("po-2");
      expect(result.error).toContain("nonexistent");
      // Rollback: updateRecordTypeSchema called once for op1 apply + once for rollback
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(2);
    });

    it("returns failure when record type not found", async () => {
      const op = makeSetFieldOp();
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);

      const result = await executePatchOps(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("handles record type with null schema", async () => {
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

      const result = await executePatchOps(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      const calledSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(calledSchema.fields).toHaveLength(1);
      expect(calledSchema.fields[0].name).toBe("severity");
      // previousSnapshot should be { fields: [] } for null schema
      expect(mockTenantStorage.updateChangePatchOpSnapshot).toHaveBeenCalledWith(
        "po-1",
        { fields: [] },
      );
    });

    it("skips unknown opTypes without error", async () => {
      const op = makeSetFieldOp({ opType: "unknown_op" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);

      const result = await executePatchOps(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
    });

    it("rolls back in reverse order", async () => {
      const rt1: RecordType = { ...fakeRecordType, id: "rt-1", key: "task" };
      const rt2: RecordType = {
        ...fakeRecordType,
        id: "rt-2",
        key: "incident",
        schema: { fields: [{ name: "severity", type: "choice" }] },
      };
      const op1 = makeSetFieldOp({
        id: "po-1",
        payload: { recordType: "task", field: "newField", definition: { type: "string" } },
      });
      const op2 = makeSetFieldOp({
        id: "po-2",
        payload: { recordType: "incident", field: "impact", definition: { type: "string" } },
      });
      const op3 = makeSetFieldOp({
        id: "po-3",
        payload: { recordType: "missing", field: "x", definition: { type: "string" } },
      });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2, op3]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(rt1) // op1
        .mockResolvedValueOnce(rt2) // op2
        .mockResolvedValueOnce(undefined); // op3 fails
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executePatchOps(ctx, "change-1");

      expect(result.success).toBe(false);
      // 2 applies + 2 rollbacks = 4 calls
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(4);
      // Rollback calls should restore in reverse: rt2 first, then rt1
      const rollbackCalls = mockTenantStorage.updateRecordTypeSchema.mock.calls.slice(2);
      expect(rollbackCalls[0][0]).toBe("rt-2"); // rolled back second op first
      expect(rollbackCalls[1][0]).toBe("rt-1"); // then first op
    });
  });
});
