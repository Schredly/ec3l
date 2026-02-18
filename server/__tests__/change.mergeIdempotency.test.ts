import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "../tenant";
import type { ChangeRecord } from "@shared/schema";

const mockTenantStorage = {
  getChange: vi.fn(),
  updateChangeStatus: vi.fn(),
};

vi.mock("../tenantStorage", () => ({
  getTenantStorage: () => mockTenantStorage,
}));

const mockExecutePatchOps = vi.fn();
vi.mock("../executors/patchOpExecutor", () => ({
  executePatchOps: (...args: unknown[]) => mockExecutePatchOps(...args),
  PatchOpExecutionError: class extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { updateChangeStatus } from "../services/changeService";

// --- Fixtures ---

const ctx: TenantContext = { tenantId: "tenant-a", userId: "user-1", source: "header" };

const mergedChange: ChangeRecord = {
  id: "change-1",
  projectId: "proj-1",
  title: "Already merged",
  description: null,
  status: "Merged",
  branchName: null,
  moduleId: null,
  modulePath: null,
  environmentId: null,
  createdAt: new Date(),
};

describe("change merge idempotency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns existing change without re-execution when already Merged", async () => {
    mockTenantStorage.getChange.mockResolvedValue(mergedChange);

    const result = await updateChangeStatus(ctx, "change-1", "Merged");

    expect(result).toEqual(mergedChange);

    // Executor must NOT be called
    expect(mockExecutePatchOps).not.toHaveBeenCalled();

    // No DB status update
    expect(mockTenantStorage.updateChangeStatus).not.toHaveBeenCalled();
  });

  it("does not throw when transitioning Merged → Merged", async () => {
    mockTenantStorage.getChange.mockResolvedValue(mergedChange);

    await expect(
      updateChangeStatus(ctx, "change-1", "Merged"),
    ).resolves.not.toThrow();
  });
});
