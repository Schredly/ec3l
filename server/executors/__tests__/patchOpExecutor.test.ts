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

import {
  executeChange,
  PatchOpExecutionError,
  applySetField,
  applyAddField,
  applyRemoveField,
  applyRenameField,
} from "../patchOpExecutor";
import type { RecordTypeSchema } from "../patchOpExecutor";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Fix bug",
  description: null,
  status: "Ready",
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

function makeOp(opType: string, payload: unknown, overrides: Partial<ChangePatchOp> = {}): ChangePatchOp {
  return {
    id: "po-1",
    tenantId: "tenant-a",
    changeId: "change-1",
    targetId: "ct-rt",
    opType,
    payload,
    previousSnapshot: null,
    executedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSetFieldOp(overrides: Partial<ChangePatchOp> = {}): ChangePatchOp {
  return makeOp("set_field", {
    recordType: "task",
    field: "severity",
    definition: { type: "choice", required: true, options: ["low", "medium", "high"] },
  }, overrides);
}

function setupDefaults() {
  mockTenantStorage.getChange.mockResolvedValue(fakeChange);
  mockTenantStorage.getChangeTarget.mockResolvedValue(fakeTarget);
  mockTenantStorage.getSnapshotByChangeAndKey.mockResolvedValue(undefined);
  mockTenantStorage.createRecordTypeSnapshot.mockResolvedValue({});
}

// --- Pure Transform Tests ---

describe("pure transforms", () => {
  const baseSchema: RecordTypeSchema = {
    fields: [
      { name: "title", type: "string", required: true },
      { name: "status", type: "choice", required: true },
    ],
  };

  describe("applySetField", () => {
    it("adds a new field when it doesn't exist", () => {
      const result = applySetField(
        baseSchema,
        { recordType: "task", field: "severity", definition: { type: "choice" } },
        new Set(),
      );
      expect(result.fields).toHaveLength(3);
      expect(result.fields[2]).toEqual({ name: "severity", type: "choice" });
    });

    it("replaces an existing field", () => {
      const result = applySetField(
        baseSchema,
        { recordType: "task", field: "title", definition: { type: "text", required: false } },
        new Set(),
      );
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toEqual({ name: "title", type: "text", required: false });
    });

    it("throws when weakening a protected baseType field", () => {
      expect(() =>
        applySetField(
          baseSchema,
          { recordType: "task", field: "title", definition: { type: "string", required: false } },
          new Set(["title"]),
        ),
      ).toThrow("Cannot weaken required baseType field");
    });

    it("does not mutate the original schema", () => {
      const original = { fields: [{ name: "title", type: "string" }] };
      applySetField(
        original,
        { recordType: "task", field: "desc", definition: { type: "text" } },
        new Set(),
      );
      expect(original.fields).toHaveLength(1);
    });
  });

  describe("applyAddField", () => {
    it("adds a field", () => {
      const result = applyAddField(baseSchema, {
        recordType: "task",
        field: "priority",
        definition: { type: "number" },
      });
      expect(result.fields).toHaveLength(3);
      expect(result.fields[2]).toEqual({ name: "priority", type: "number" });
    });

    it("throws when field already exists", () => {
      expect(() =>
        applyAddField(baseSchema, {
          recordType: "task",
          field: "title",
          definition: { type: "string" },
        }),
      ).toThrow("Field already exists");
    });

    it("does not mutate the original schema", () => {
      const original = { fields: [{ name: "title", type: "string" }] };
      applyAddField(original, {
        recordType: "task",
        field: "desc",
        definition: { type: "text" },
      });
      expect(original.fields).toHaveLength(1);
    });
  });

  describe("applyRemoveField", () => {
    it("removes a field", () => {
      const result = applyRemoveField(
        baseSchema,
        { recordType: "task", field: "status" },
        new Set(),
      );
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe("title");
    });

    it("throws when field does not exist", () => {
      expect(() =>
        applyRemoveField(
          baseSchema,
          { recordType: "task", field: "nonexistent" },
          new Set(),
        ),
      ).toThrow("Field does not exist");
    });

    it("throws when removing a protected baseType field", () => {
      expect(() =>
        applyRemoveField(
          baseSchema,
          { recordType: "task", field: "title" },
          new Set(["title"]),
        ),
      ).toThrow("Cannot remove required baseType field");
    });

    it("does not mutate the original schema", () => {
      const original = { fields: [{ name: "title", type: "string" }, { name: "status", type: "choice" }] };
      applyRemoveField(original, { recordType: "task", field: "status" }, new Set());
      expect(original.fields).toHaveLength(2);
    });
  });

  describe("applyRenameField", () => {
    it("renames a field and preserves properties", () => {
      const result = applyRenameField(
        baseSchema,
        { recordType: "task", oldName: "title", newName: "name" },
        new Set(),
      );
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toEqual({ name: "name", type: "string", required: true });
    });

    it("throws when old field does not exist", () => {
      expect(() =>
        applyRenameField(
          baseSchema,
          { recordType: "task", oldName: "nonexistent", newName: "x" },
          new Set(),
        ),
      ).toThrow("Field does not exist");
    });

    it("throws when new name already exists", () => {
      expect(() =>
        applyRenameField(
          baseSchema,
          { recordType: "task", oldName: "title", newName: "status" },
          new Set(),
        ),
      ).toThrow("Field already exists");
    });

    it("throws when renaming a protected baseType field", () => {
      expect(() =>
        applyRenameField(
          baseSchema,
          { recordType: "task", oldName: "title", newName: "name" },
          new Set(["title"]),
        ),
      ).toThrow("Cannot rename required baseType field");
    });

    it("does not mutate the original schema", () => {
      const original = { fields: [{ name: "title", type: "string" }] };
      applyRenameField(original, { recordType: "task", oldName: "title", newName: "name" }, new Set());
      expect(original.fields[0].name).toBe("title");
    });
  });
});

// --- Integration Tests ---

describe("patchOpExecutor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("state guards", () => {
    it("throws if change not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);

      await expect(executeChange(ctx, "no-change")).rejects.toThrow("Change not found");
    });

    it("returns success with zero applied when no patch ops exist", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);

      const result = await executeChange(ctx, "change-1");
      expect(result).toEqual({ success: true, appliedCount: 0 });
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
          schema: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({ name: "title" }),
              expect.objectContaining({ name: "status" }),
            ]),
          }),
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

    it("returns failure with no DB writes when transform fails", async () => {
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
      mockTenantStorage.getRecordTypeByKey.mockResolvedValueOnce(fakeRecordType);
      // No second record type — will fail in load phase

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(0);
      expect(result.error).toContain("nonexistent");
      // No DB writes should have occurred
      expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
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

      await expect(executeChange(ctx, "change-1")).rejects.toThrow(
        /must be type "record_type"/,
      );
    });

    it("multiple ops on same RT result in a single updateRecordTypeSchema call", async () => {
      setupDefaults();
      const op1 = makeOp("set_field", {
        recordType: "task", field: "severity", definition: { type: "choice" },
      }, { id: "po-1" });
      const op2 = makeOp("add_field", {
        recordType: "task", field: "priority", definition: { type: "number" },
      }, { id: "po-2" });
      const op3 = makeOp("set_field", {
        recordType: "task", field: "title", definition: { type: "text", required: true },
      }, { id: "po-3" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2, op3]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(3);
      // Only one updateRecordTypeSchema call for the single RT
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(1);
      // Final schema should have: title (replaced), status (original), severity (set), priority (added)
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(finalSchema.fields).toHaveLength(4);
      expect(finalSchema.fields.map((f: any) => f.name)).toEqual(["title", "status", "severity", "priority"]);
    });

    it("ops across different RTs persist separately", async () => {
      setupDefaults();
      const rt2: RecordType = {
        ...fakeRecordType,
        id: "rt-2",
        key: "incident",
        schema: { fields: [{ name: "severity", type: "choice" }] },
      };
      const target2: ChangeTarget = { ...fakeTarget, id: "ct-rt2" };

      const op1 = makeOp("set_field", {
        recordType: "task", field: "newField", definition: { type: "string" },
      }, { id: "po-1" });
      const op2 = makeOp("add_field", {
        recordType: "incident", field: "impact", definition: { type: "string" },
      }, { id: "po-2", targetId: "ct-rt2" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getChangeTarget
        .mockResolvedValueOnce(fakeTarget)
        .mockResolvedValueOnce(target2);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(fakeRecordType)
        .mockResolvedValueOnce(rt2);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(2);
      // Two separate updateRecordTypeSchema calls
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(2);
      expect(mockTenantStorage.updateRecordTypeSchema.mock.calls[0][0]).toBe("rt-1");
      expect(mockTenantStorage.updateRecordTypeSchema.mock.calls[1][0]).toBe("rt-2");
    });

    it("no DB writes on transform failure", async () => {
      setupDefaults();
      // add_field then add_field same name -> second fails
      const op1 = makeOp("add_field", {
        recordType: "task", field: "priority", definition: { type: "number" },
      }, { id: "po-1" });
      const op2 = makeOp("add_field", {
        recordType: "task", field: "priority", definition: { type: "string" },
      }, { id: "po-2" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Field already exists");
      expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
      expect(mockTenantStorage.updateChangePatchOpSnapshot).not.toHaveBeenCalled();
    });

    it("per-op previousSnapshot stamped with correct intermediate schemas", async () => {
      setupDefaults();
      const op1 = makeOp("add_field", {
        recordType: "task", field: "priority", definition: { type: "number" },
      }, { id: "po-1" });
      const op2 = makeOp("add_field", {
        recordType: "task", field: "severity", definition: { type: "choice" },
      }, { id: "po-2" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      await executeChange(ctx, "change-1");

      // op1 snapshot = original schema (2 fields)
      const snap1 = mockTenantStorage.updateChangePatchOpSnapshot.mock.calls[0][1];
      expect(snap1.fields).toHaveLength(2);
      // op2 snapshot = after op1 (3 fields including priority)
      const snap2 = mockTenantStorage.updateChangePatchOpSnapshot.mock.calls[1][1];
      expect(snap2.fields).toHaveLength(3);
      expect(snap2.fields.map((f: any) => f.name)).toContain("priority");
    });

    // --- Single new op type success ---

    it("executes a single add_field op", async () => {
      setupDefaults();
      const op = makeOp("add_field", {
        recordType: "task", field: "priority", definition: { type: "number" },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 1 });
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(finalSchema.fields).toHaveLength(3);
      expect(finalSchema.fields[2]).toEqual({ name: "priority", type: "number" });
    });

    it("executes a single remove_field op", async () => {
      setupDefaults();
      const op = makeOp("remove_field", {
        recordType: "task", field: "status",
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 1 });
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(finalSchema.fields).toHaveLength(1);
      expect(finalSchema.fields[0].name).toBe("title");
    });

    it("executes a single rename_field op", async () => {
      setupDefaults();
      const op = makeOp("rename_field", {
        recordType: "task", oldName: "title", newName: "name",
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result).toEqual({ success: true, appliedCount: 1 });
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(finalSchema.fields[0]).toEqual({ name: "name", type: "string", required: true });
    });

    // --- BaseType protections for new ops ---

    it("rejects weakening a required baseType field via set_field", async () => {
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
    });

    it("rejects removing a required baseType field", async () => {
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
        schema: { fields: [{ name: "state", type: "choice", required: true }] },
      };

      const op = makeOp("remove_field", { recordType: "incident", field: "state" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incident)
        .mockResolvedValueOnce(baseTask);

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot remove required baseType field");
    });

    it("rejects renaming a required baseType field", async () => {
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
        schema: { fields: [{ name: "state", type: "choice", required: true }] },
      };

      const op = makeOp("rename_field", { recordType: "incident", oldName: "state", newName: "st" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incident)
        .mockResolvedValueOnce(baseTask);

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot rename required baseType field");
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

      const op = makeOp("add_field", {
        recordType: "incident",
        field: "new_field",
        definition: { type: "string", required: false },
      });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op]);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(incident)
        .mockResolvedValueOnce(baseTask);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...incident, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
    });

    // --- Sequencing edge cases ---

    it("add then remove same field", async () => {
      setupDefaults();
      const op1 = makeOp("add_field", {
        recordType: "task", field: "temp", definition: { type: "string" },
      }, { id: "po-1" });
      const op2 = makeOp("remove_field", {
        recordType: "task", field: "temp",
      }, { id: "po-2" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(2);
      // Final schema should be same as original (field added then removed)
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(finalSchema.fields).toHaveLength(2);
      expect(finalSchema.fields.map((f: any) => f.name)).toEqual(["title", "status"]);
    });

    it("add then rename", async () => {
      setupDefaults();
      const op1 = makeOp("add_field", {
        recordType: "task", field: "temp", definition: { type: "string" },
      }, { id: "po-1" });
      const op2 = makeOp("rename_field", {
        recordType: "task", oldName: "temp", newName: "permanent",
      }, { id: "po-2" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      expect(finalSchema.fields.map((f: any) => f.name)).toContain("permanent");
      expect(finalSchema.fields.map((f: any) => f.name)).not.toContain("temp");
    });

    it("rename then set_field on renamed field", async () => {
      setupDefaults();
      const op1 = makeOp("rename_field", {
        recordType: "task", oldName: "title", newName: "name",
      }, { id: "po-1" });
      const op2 = makeOp("set_field", {
        recordType: "task", field: "name", definition: { type: "text", required: false },
      }, { id: "po-2" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2]);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(fakeRecordType);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      const finalSchema = mockTenantStorage.updateRecordTypeSchema.mock.calls[0][1];
      const nameField = finalSchema.fields.find((f: any) => f.name === "name");
      expect(nameField).toEqual({ name: "name", type: "text", required: false });
    });

    it("snapshot created once per RT with per-op previousSnapshot for multiple RTs", async () => {
      setupDefaults();
      const rt2: RecordType = {
        ...fakeRecordType,
        id: "rt-2",
        key: "incident",
        schema: { fields: [{ name: "severity", type: "choice" }] },
      };
      const target2: ChangeTarget = { ...fakeTarget, id: "ct-rt2" };

      const op1 = makeOp("add_field", {
        recordType: "task", field: "priority", definition: { type: "number" },
      }, { id: "po-1" });
      const op2 = makeOp("add_field", {
        recordType: "incident", field: "impact", definition: { type: "string" },
      }, { id: "po-2", targetId: "ct-rt2" });
      const op3 = makeOp("add_field", {
        recordType: "task", field: "category", definition: { type: "string" },
      }, { id: "po-3" });

      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([op1, op2, op3]);
      mockTenantStorage.getChangeTarget
        .mockResolvedValueOnce(fakeTarget)
        .mockResolvedValueOnce(target2)
        .mockResolvedValueOnce(fakeTarget);
      mockTenantStorage.getRecordTypeByKey
        .mockResolvedValueOnce(fakeRecordType)
        .mockResolvedValueOnce(rt2);
      mockTenantStorage.updateRecordTypeSchema.mockImplementation(
        async (_id: string, schema: unknown) => ({ ...fakeRecordType, schema }),
      );
      mockTenantStorage.updateChangePatchOpSnapshot.mockResolvedValue({});

      const result = await executeChange(ctx, "change-1");

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(3);
      // 2 snapshots (one per RT)
      expect(mockTenantStorage.createRecordTypeSnapshot).toHaveBeenCalledTimes(2);
      // 2 updateRecordTypeSchema calls (one per RT)
      expect(mockTenantStorage.updateRecordTypeSchema).toHaveBeenCalledTimes(2);
      // 3 per-op snapshot stamps
      expect(mockTenantStorage.updateChangePatchOpSnapshot).toHaveBeenCalledTimes(3);
    });
  });
});
