import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
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

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { createPatchOp, PatchOpServiceError } from "../services/patchOpService";

// --- Fixtures ---

const tenantA: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const changeInProjectA: ChangeRecord = {
  id: "change-a",
  projectId: "proj-a",
  title: "Change in A",
  description: null,
  status: "Draft",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const changeInProjectB: ChangeRecord = {
  id: "change-b",
  projectId: "proj-b",
  title: "Change in B",
  description: null,
  status: "Draft",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const targetInProjectA: ChangeTarget = {
  id: "ct-a",
  tenantId: "tenant-a",
  projectId: "proj-a",
  changeId: "change-a",
  type: "record_type",
  selector: { recordTypeKey: "incident" },
  createdAt: new Date(),
};

// Target whose projectId mismatches the change it's being used with
const targetInProjectAForChangeB: ChangeTarget = {
  id: "ct-cross",
  tenantId: "tenant-a",
  projectId: "proj-a",
  changeId: "change-b",
  type: "record_type",
  selector: { recordTypeKey: "incident" },
  createdAt: new Date(),
};

// Defense-in-depth: target with a foreign tenantId (simulates storage bug)
const targetCrossTenant: ChangeTarget = {
  id: "ct-xt",
  tenantId: "tenant-b",
  projectId: "proj-a",
  changeId: "change-a",
  type: "record_type",
  selector: { recordTypeKey: "incident" },
  createdAt: new Date(),
};

const fakePatchOp: ChangePatchOp = {
  id: "po-1",
  tenantId: "tenant-a",
  changeId: "change-a",
  targetId: "ct-a",
  opType: "set_field",
  payload: { recordType: "incident", field: "severity", definition: { type: "string" } },
  createdAt: new Date(),
};

describe("patchOp project isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects patch op when target project differs from change project", async () => {
    mockTenantStorage.getChange.mockResolvedValue(changeInProjectB);
    mockTenantStorage.getChangeTarget.mockResolvedValue(targetInProjectAForChangeB);

    await expect(
      createPatchOp(tenantA, "change-b", "ct-cross", "set_field", {
        recordType: "incident",
        field: "severity",
        definition: { type: "string" },
      }),
    ).rejects.toThrow("Patch target must belong to same project as change");
  });

  it("rejects patch op when target tenant differs from context tenant (defense-in-depth)", async () => {
    mockTenantStorage.getChange.mockResolvedValue(changeInProjectA);
    mockTenantStorage.getChangeTarget.mockResolvedValue(targetCrossTenant);

    await expect(
      createPatchOp(tenantA, "change-a", "ct-xt", "set_field", {
        recordType: "incident",
        field: "severity",
        definition: { type: "string" },
      }),
    ).rejects.toThrow("Cross-tenant patch target not allowed");
  });

  it("allows patch op when target and change share the same project and tenant", async () => {
    mockTenantStorage.getChange.mockResolvedValue(changeInProjectA);
    mockTenantStorage.getChangeTarget.mockResolvedValue(targetInProjectA);
    mockTenantStorage.getRecordTypeByKey.mockResolvedValue({ id: "rt-1", key: "incident" });
    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);
    mockTenantStorage.createChangePatchOp.mockResolvedValue(fakePatchOp);

    const result = await createPatchOp(tenantA, "change-a", "ct-a", "set_field", {
      recordType: "incident",
      field: "severity",
      definition: { type: "string" },
    });

    expect(result).toEqual(fakePatchOp);
    expect(mockTenantStorage.createChangePatchOp).toHaveBeenCalledOnce();
  });
});
