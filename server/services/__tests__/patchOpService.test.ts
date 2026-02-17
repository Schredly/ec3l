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

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

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
  selector: { path: "src/main.ts" },
  createdAt: new Date(),
};

const fakeModuleTarget: ChangeTarget = {
  id: "ct-mod",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "module",
  selector: { moduleId: "mod-1" },
  createdAt: new Date(),
};

const fakePatchOp: ChangePatchOp = {
  id: "op-1",
  tenantId: "tenant-a",
  changeId: "change-1",
  targetId: "ct-file",
  opType: "edit_file",
  payload: { content: "new content" },
  createdAt: new Date(),
};

describe("patchOpService", () => {
  const ctx = makeTenantContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPatchOp", () => {
    it("creates a patch op for a file target", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeFileTarget);
      mockTenantStorage.createChangePatchOp.mockResolvedValue(fakePatchOp);

      const result = await createPatchOp(
        ctx,
        "change-1",
        "ct-file",
        "edit_file",
        { content: "new content" },
      );

      expect(mockTenantStorage.getChange).toHaveBeenCalledWith("change-1");
      expect(mockTenantStorage.getChangeTarget).toHaveBeenCalledWith("ct-file");
      expect(mockTenantStorage.createChangePatchOp).toHaveBeenCalledWith({
        tenantId: "tenant-a",
        changeId: "change-1",
        targetId: "ct-file",
        opType: "edit_file",
        payload: { content: "new content" },
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

    it("throws 400 when target belongs to different change", async () => {
      const otherTarget = { ...fakeFileTarget, changeId: "change-other" };
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(otherTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-file", "edit_file", {}),
      ).rejects.toThrow("Target does not belong to this change");
    });

    it("blocks edit_file when target type is not file", async () => {
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeModuleTarget);

      await expect(
        createPatchOp(ctx, "change-1", "ct-mod", "edit_file", {}),
      ).rejects.toThrow('edit_file operations require a target of type "file"');
    });

    it("allows non-edit_file ops on non-file targets", async () => {
      const modPatchOp = { ...fakePatchOp, targetId: "ct-mod", opType: "update_config" };
      mockTenantStorage.getChange.mockResolvedValue(fakeChange);
      mockTenantStorage.getChangeTarget.mockResolvedValue(fakeModuleTarget);
      mockTenantStorage.createChangePatchOp.mockResolvedValue(modPatchOp);

      const result = await createPatchOp(
        ctx,
        "change-1",
        "ct-mod",
        "update_config",
        { key: "value" },
      );

      expect(result.opType).toBe("update_config");
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
