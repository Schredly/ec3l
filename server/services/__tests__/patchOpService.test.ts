import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { ChangeRecord, ChangeTarget, ChangePatchOp } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  getChangeTarget: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  createChangePatchOp: vi.fn(),
  getChangePatchOpsByChange: vi.fn(),
  getChangePatchOp: vi.fn(),
  deleteChangePatchOp: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  createPatchOp,
  deletePatchOp,
  listPatchOps,
  PatchOpServiceError,
} from "../patchOpService";

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const fakeChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Fix bug",
  description: null,
  status: "Draft",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const fakeFileTarget: ChangeTarget = {
  id: "ct-file",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "file",
  selector: { filePath: "src/index.ts" },
  createdAt: new Date(),
};

const fakeFormTarget: ChangeTarget = {
  id: "ct-form",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "form",
  selector: { formId: "form-1" },
  createdAt: new Date(),
};

const fakeRecordTypeTarget: ChangeTarget = {
  id: "ct-rt",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "record_type",
  selector: { recordTypeId: "rt-1" },
  createdAt: new Date(),
};

const fakePatchOp: ChangePatchOp = {
  id: "po-1",
  tenantId: "tenant-a",
  changeId: "change-1",
  targetId: "ct-file",
  opType: "edit_file",
  payload: { content: "hello" },
  createdAt: new Date(),
};

describe("patchOpService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPatchOp", () => {
    it("creates a patch op for a valid file target", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFileTarget);
      mockTenantStorage.createChangePatchOp.mockResolvedValue(fakePatchOp);

      const result = await createPatchOp(ctx, "change-1", "ct-file", "edit_file", { content: "hello" });

      expect(mockTenantStorage.getChange).toHaveBeenCalledWith("change-1");
      expect(mockTenantStorage.getChangeTarget).toHaveBeenCalledWith("ct-file");
      expect(mockTenantStorage.createChangePatchOp).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        changeId: "change-1",
        targetId: "ct-file",
        opType: "edit_file",
        payload: { content: "hello" },
      });
      expect(result).toEqual(fakePatchOp);
    });

    it("throws 404 when change not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);

      await expect(
        createPatchOp(ctx, "no-change", "ct-file", "edit_file", {}),
      ).rejects.toThrow("Change not found");
    });

    it("throws 404 when target not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(undefined);

      await expect(
        createPatchOp(ctx, "change-1", "no-target", "edit_file", {}),
      ).rejects.toThrow("Change target not found");
    });

    it("throws 400 when target belongs to a different change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue({
        ...fakeFileTarget,
        changeId: "other-change",
      });

      await expect(
        createPatchOp(ctx, "change-1", "ct-file", "edit_file", {}),
      ).rejects.toThrow("Target does not belong to this change");
    });

    it("rejects edit_file when target type is not file", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFormTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-form", "edit_file", {}),
      ).rejects.toThrow(/edit_file.*type "file"/);
    });

    it("allows edit_file when target type is file", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFileTarget);
      mockTenantStorage.createChangePatchOp.mockResolvedValue(fakePatchOp);

      const result = await createPatchOp(ctx, "change-1", "ct-file", "edit_file", { content: "x" });
      expect(result).toEqual(fakePatchOp);
    });

    it("creates set_field op with valid payload and record_type target", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue({ id: "rt-1", key: "incident" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);
      const expected = {
        ...fakePatchOp,
        targetId: "ct-rt",
        opType: "set_field",
        payload: { recordType: "incident", field: "severity", definition: { type: "number", required: true } },
      };
      mockTenantStorage.createChangePatchOp.mockResolvedValue(expected);

      const result = await createPatchOp(ctx, "change-1", "ct-rt", "set_field", {
        recordType: "incident",
        field: "severity",
        definition: { type: "number", required: true },
      });
      expect(result.opType).toBe("set_field");
      expect(mockTenantStorage.getRecordTypeByKey).toHaveBeenCalledWith("incident");
    });

    it("rejects set_field when target type is not record_type", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFormTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-form", "set_field", {
          recordType: "incident",
          field: "severity",
          definition: { type: "number" },
        }),
      ).rejects.toThrow(/set_field.*type "record_type"/);
    });

    it("rejects set_field when recordType not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue(undefined);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "set_field", {
          recordType: "nonexistent",
          field: "severity",
          definition: { type: "number" },
        }),
      ).rejects.toThrow('Record type "nonexistent" not found');
    });

    it("rejects set_field with missing recordType in payload", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "set_field", {
          field: "severity",
          definition: { type: "number" },
        }),
      ).rejects.toThrow(/recordType/);
    });

    it("rejects set_field with missing field in payload", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "set_field", {
          recordType: "incident",
          definition: { type: "number" },
        }),
      ).rejects.toThrow(/field/);
    });

    it("rejects set_field with missing definition in payload", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "set_field", {
          recordType: "incident",
          field: "severity",
        }),
      ).rejects.toThrow(/definition/);
    });

    it("rejects set_field when definition missing type", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "set_field", {
          recordType: "incident",
          field: "severity",
          definition: { required: true },
        }),
      ).rejects.toThrow(/definition requires a string "type"/);
    });

    it("allows non-edit_file opType on any target type", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFormTarget);
      mockTenantStorage.createChangePatchOp.mockResolvedValue({
        ...fakePatchOp,
        targetId: "ct-form",
        opType: "update_field",
      });

      const result = await createPatchOp(ctx, "change-1", "ct-form", "update_field", { field: "name" });
      expect(result.opType).toBe("update_field");
    });

    // --- add_field validation ---

    it("creates add_field op with valid payload", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue({ id: "rt-1", key: "incident" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);
      const expected = {
        ...fakePatchOp,
        targetId: "ct-rt",
        opType: "add_field",
        payload: { recordType: "incident", field: "impact", definition: { type: "string" } },
      };
      mockTenantStorage.createChangePatchOp.mockResolvedValue(expected);

      const result = await createPatchOp(ctx, "change-1", "ct-rt", "add_field", {
        recordType: "incident",
        field: "impact",
        definition: { type: "string" },
      });
      expect(result.opType).toBe("add_field");
      expect(mockTenantStorage.getRecordTypeByKey).toHaveBeenCalledWith("incident");
    });

    it("rejects add_field with missing recordType", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "add_field", {
          field: "impact",
          definition: { type: "string" },
        }),
      ).rejects.toThrow(/recordType/);
    });

    it("rejects add_field with missing field", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "add_field", {
          recordType: "incident",
          definition: { type: "string" },
        }),
      ).rejects.toThrow(/field/);
    });

    it("rejects add_field with missing definition", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "add_field", {
          recordType: "incident",
          field: "impact",
        }),
      ).rejects.toThrow(/definition/);
    });

    it("rejects add_field when target type is not record_type", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFormTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-form", "add_field", {
          recordType: "incident",
          field: "impact",
          definition: { type: "string" },
        }),
      ).rejects.toThrow(/add_field.*type "record_type"/);
    });

    // --- remove_field validation ---

    it("creates remove_field op with valid payload", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue({ id: "rt-1", key: "incident" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);
      const expected = {
        ...fakePatchOp,
        targetId: "ct-rt",
        opType: "remove_field",
        payload: { recordType: "incident", field: "severity" },
      };
      mockTenantStorage.createChangePatchOp.mockResolvedValue(expected);

      const result = await createPatchOp(ctx, "change-1", "ct-rt", "remove_field", {
        recordType: "incident",
        field: "severity",
      });
      expect(result.opType).toBe("remove_field");
    });

    it("rejects remove_field with missing recordType", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "remove_field", {
          field: "severity",
        }),
      ).rejects.toThrow(/recordType/);
    });

    it("rejects remove_field with missing field", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "remove_field", {
          recordType: "incident",
        }),
      ).rejects.toThrow(/field/);
    });

    it("rejects remove_field when target type is not record_type", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFormTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-form", "remove_field", {
          recordType: "incident",
          field: "severity",
        }),
      ).rejects.toThrow(/remove_field.*type "record_type"/);
    });

    // --- rename_field validation ---

    it("creates rename_field op with valid payload", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);
      mockTenantStorage.getRecordTypeByKey.mockResolvedValue({ id: "rt-1", key: "incident" });
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);
      const expected = {
        ...fakePatchOp,
        targetId: "ct-rt",
        opType: "rename_field",
        payload: { recordType: "incident", oldName: "severity", newName: "impact" },
      };
      mockTenantStorage.createChangePatchOp.mockResolvedValue(expected);

      const result = await createPatchOp(ctx, "change-1", "ct-rt", "rename_field", {
        recordType: "incident",
        oldName: "severity",
        newName: "impact",
      });
      expect(result.opType).toBe("rename_field");
    });

    it("rejects rename_field with missing recordType", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "rename_field", {
          oldName: "severity",
          newName: "impact",
        }),
      ).rejects.toThrow(/recordType/);
    });

    it("rejects rename_field with missing oldName", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "rename_field", {
          recordType: "incident",
          newName: "impact",
        }),
      ).rejects.toThrow(/oldName/);
    });

    it("rejects rename_field with missing newName", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeRecordTypeTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-rt", "rename_field", {
          recordType: "incident",
          oldName: "severity",
        }),
      ).rejects.toThrow(/newName/);
    });

    it("rejects rename_field when target type is not record_type", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFormTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-form", "rename_field", {
          recordType: "incident",
          oldName: "severity",
          newName: "impact",
        }),
      ).rejects.toThrow(/rename_field.*type "record_type"/);
    });
  });

  describe("deletePatchOp", () => {
    it("deletes an unexecuted patch op", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOp.mockResolvedValue({ ...fakePatchOp, executedAt: null });
      mockTenantStorage.deleteChangePatchOp.mockResolvedValue(fakePatchOp);

      const result = await deletePatchOp(ctx, "change-1", "po-1");
      expect(mockTenantStorage.deleteChangePatchOp).toHaveBeenCalledWith("po-1");
      expect(result).toEqual(fakePatchOp);
    });

    it("throws 404 when change not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(undefined);

      await expect(
        deletePatchOp(ctx, "no-change", "po-1"),
      ).rejects.toThrow("Change not found");
    });

    it("throws 400 when change is merged", async () => {
      mockTenantStorage.getChange.mockResolvedValue({ ...fakeChange, status: "Merged" });

      await expect(
        deletePatchOp(ctx, "change-1", "po-1"),
      ).rejects.toThrow("Cannot delete ops from a merged change");
    });

    it("throws 404 when patch op not found", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOp.mockResolvedValue(undefined);

      await expect(
        deletePatchOp(ctx, "change-1", "no-op"),
      ).rejects.toThrow("Patch op not found");
    });

    it("throws 404 when patch op belongs to a different tenant", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOp.mockResolvedValue({
        ...fakePatchOp,
        tenantId: "tenant-b",
        executedAt: null,
      });

      await expect(
        deletePatchOp(ctx, "change-1", "po-1"),
      ).rejects.toThrow("Patch op not found");
    });

    it("throws 400 when patch op belongs to a different change", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOp.mockResolvedValue({
        ...fakePatchOp,
        changeId: "other-change",
        executedAt: null,
      });

      await expect(
        deletePatchOp(ctx, "change-1", "po-1"),
      ).rejects.toThrow("Patch op does not belong to this change");
    });

    it("throws 409 when patch op has already been executed", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangePatchOp.mockResolvedValue({
        ...fakePatchOp,
        executedAt: new Date(),
      });

      const err = await deletePatchOp(ctx, "change-1", "po-1").catch((e: PatchOpServiceError) => e);
      expect(err).toBeInstanceOf(PatchOpServiceError);
      expect(err.message).toBe("Cannot delete an executed patch op");
      expect(err.statusCode).toBe(409);
    });
  });

  describe("listPatchOps", () => {
    it("returns patch ops for a change", async () => {
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([fakePatchOp]);

      const result = await listPatchOps(ctx, "change-1");
      expect(mockTenantStorage.getChangePatchOpsByChange).toHaveBeenCalledWith("change-1");
      expect(result).toEqual([fakePatchOp]);
    });

    it("returns empty array for non-existent change", async () => {
      mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);

      const result = await listPatchOps(ctx, "no-change");
      expect(result).toEqual([]);
    });
  });
});
