import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { ChangeRecord, ChangeTarget, ChangePatchOp } from "@shared/schema";

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

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

vi.mock("../services/domainEventService", () => ({
  emitDomainEvent: vi.fn(),
}));

// Executor is one level up from __tests__, so import from executors/
import { executeChange, PatchOpExecutionError } from "../executors/patchOpExecutor";

// --- Fixtures ---

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const draftChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Draft change",
  description: null,
  status: "Draft",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

const mergedChange: ChangeRecord = {
  ...draftChange,
  id: "change-merged",
  status: "Merged",
};

const fakeTarget: ChangeTarget = {
  id: "ct-1",
  tenantId: "tenant-a",
  projectId: "proj-1",
  changeId: "change-1",
  type: "record_type",
  selector: { recordTypeKey: "task" },
  createdAt: new Date(),
};

function makeOp(overrides: Partial<ChangePatchOp> = {}): ChangePatchOp {
  return {
    id: "po-1",
    tenantId: "tenant-a",
    changeId: "change-1",
    targetId: "ct-1",
    opType: "set_field",
    payload: { recordType: "task", field: "severity", definition: { type: "string" } },
    previousSnapshot: null,
    executedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("patchOp re-execution prevention", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects execution on a merged change", async () => {
    mockTenantStorage.getChange.mockResolvedValue(mergedChange);

    await expect(executeChange(ctx, "change-merged")).rejects.toThrow(
      "Cannot execute patch ops on merged change",
    );

    // No ops should be fetched — guard fires before loading ops
    expect(mockTenantStorage.getChangePatchOpsByChange).not.toHaveBeenCalled();
  });

  it("rejects re-execution when ops already have executedAt set", async () => {
    const executedAt = new Date("2025-01-01T00:00:00Z");
    const executedOp = makeOp({ executedAt, previousSnapshot: { fields: [] } });

    mockTenantStorage.getChange.mockResolvedValue(draftChange);
    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([executedOp]);

    await expect(executeChange(ctx, "change-1")).rejects.toThrow(
      "Patch operations already executed",
    );

    // No Phase 1/2/3 work should happen
    expect(mockTenantStorage.getChangeTarget).not.toHaveBeenCalled();
    expect(mockTenantStorage.getRecordTypeByKey).not.toHaveBeenCalled();
    expect(mockTenantStorage.createRecordTypeSnapshot).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateChangePatchOpSnapshot).not.toHaveBeenCalled();
  });

  it("rejects when even one op is already executed (partial corruption)", async () => {
    const pendingOp = makeOp({ id: "po-pending" });
    const executedOp = makeOp({
      id: "po-executed",
      executedAt: new Date("2025-01-01T00:00:00Z"),
      previousSnapshot: { fields: [] },
    });

    mockTenantStorage.getChange.mockResolvedValue(draftChange);
    mockTenantStorage.getChangePatchOpsByChange.mockResolvedValue([pendingOp, executedOp]);

    await expect(executeChange(ctx, "change-1")).rejects.toThrow(
      "Patch operations already executed",
    );

    // No snapshots created, no schema updates — guard fires before any work
    expect(mockTenantStorage.createRecordTypeSnapshot).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateRecordTypeSchema).not.toHaveBeenCalled();
    expect(mockTenantStorage.updateChangePatchOpSnapshot).not.toHaveBeenCalled();
  });
});
