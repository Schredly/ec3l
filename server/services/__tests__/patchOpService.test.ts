import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../../tenant";
import type { ChangeRecord, ChangeTarget, ChangePatchOp } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  getChangeTarget: vi.fn(),
  createChangePatchOp: vi.fn(),
  getChangePatchOpsByChange: vi.fn(),
};

vi.mock("../../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import {
  createPatchOp,
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
