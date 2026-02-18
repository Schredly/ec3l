import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { ChangeRecord, ChangeTarget, ChangePatchOp } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  getChangeTarget: vi.fn(),
  getRecordTypeByKey: vi.fn(),
  createChangePatchOp: vi.fn(),
  getChangePatchOpsByChange: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

import { createPatchOp, PatchOpServiceError } from "../services/patchOpService";

// --- Fixtures ---

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

function makeChange(status: string): ChangeRecord {
  return {
    id: "change-1",
    projectId: "proj-1",
    title: "Test change",
    description: null,
    status,
    branchName: null,
    moduleId: null,
    modulePath: null,
    environmentId: null,
    createdAt: new Date(),
  };
}

const target: ChangeTarget = {
  id: "ct-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "record_type",
  selector: { recordTypeKey: "incident" },
  createdAt: new Date(),
};

const fakePatchOp: ChangePatchOp = {
  id: "po-1",
  tenantId: "tenant-a",
  changeId: "change-1",
  targetId: "ct-1",
  opType: "set_field",
  payload: { recordType: "incident", field: "severity", definition: { type: "string" } },
  createdAt: new Date(),
};

const opArgs = ["change-1", "ct-1", "set_field", {
  recordType: "incident",
  field: "severity",
  definition: { type: "string" },
}] as const;

function setupHappyPath(status: string) {
  mockTenantStorage.getChange.mockResolvedValue(makeChange(status));
  mockTenantStorage.getChangeTarget.mockResolvedValue(target);
  mockTenantStorage.getRecordTypeByKey.mockResolvedValue({ id: "rt-1", key: "incident" });
  mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([]);
  mockTenantStorage.createChangePatchOp.mockResolvedValue(fakePatchOp);
}

describe("patchOp status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Blocked statuses ---

  it("rejects patch op creation when change is Validating", async () => {
    mockTenantStorage.getChange.mockResolvedValue(makeChange("Validating"));

    await expect(createPatchOp(ctx, ...opArgs)).rejects.toThrow(
      /Cannot add patch ops.*Validating/,
    );

    expect(mockTenantStorage.getChangeTarget).not.toHaveBeenCalled();
  });

  it("rejects patch op creation when change is Ready", async () => {
    mockTenantStorage.getChange.mockResolvedValue(makeChange("Ready"));

    await expect(createPatchOp(ctx, ...opArgs)).rejects.toThrow(
      /Cannot add patch ops.*Ready/,
    );

    expect(mockTenantStorage.getChangeTarget).not.toHaveBeenCalled();
  });

  it("rejects patch op creation when change is Merged", async () => {
    mockTenantStorage.getChange.mockResolvedValue(makeChange("Merged"));

    await expect(createPatchOp(ctx, ...opArgs)).rejects.toThrow(
      /Cannot add patch ops.*Merged/,
    );

    expect(mockTenantStorage.getChangeTarget).not.toHaveBeenCalled();
  });

  // --- Allowed statuses ---

  it("allows patch op creation when change is Draft", async () => {
    setupHappyPath("Draft");

    const result = await createPatchOp(ctx, ...opArgs);

    expect(result).toEqual(fakePatchOp);
    expect(mockTenantStorage.createChangePatchOp).toHaveBeenCalledOnce();
  });

  it("allows patch op creation when change is ValidationFailed", async () => {
    setupHappyPath("ValidationFailed");

    const result = await createPatchOp(ctx, ...opArgs);

    expect(result).toEqual(fakePatchOp);
    expect(mockTenantStorage.createChangePatchOp).toHaveBeenCalledOnce();
  });
});
