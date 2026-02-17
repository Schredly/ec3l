import { describe, it, expect } from "vitest";
import type { ExecutionRequest } from "../types";
import type { TenantContext } from "../../tenant";
import type { ModuleExecutionContext } from "../../moduleContext";
import { validateRequestAtBoundary, validateModuleBoundaryPath } from "../boundaryGuard";
import {
  MissingTenantContextError,
  MissingModuleContextError,
  CapabilityNotGrantedError,
  ModuleBoundaryEscapeError,
  TenantContextMutationError,
} from "../boundaryErrors";

function makeTenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: "tenant-a",
    userId: "user-1",
    source: "header",
    ...overrides,
  };
}

function makeModuleContext(overrides: Partial<ModuleExecutionContext> = {}): ModuleExecutionContext {
  const tc = overrides.tenantContext ?? makeTenantContext();
  return {
    tenantContext: tc,
    moduleId: "mod-001",
    moduleRootPath: "src/components",
    capabilityProfile: "CODE_MODULE_DEFAULT",
    capabilities: ["fs:read", "fs:write", "cmd:run", "git:diff"],
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  const mc = overrides.moduleExecutionContext ?? makeModuleContext();
  return {
    tenantContext: mc.tenantContext,
    moduleExecutionContext: mc,
    requestedAction: "agent_task",
    capabilities: ["fs:read"],
    inputPayload: {},
    ...overrides,
  };
}

describe("Runner Boundary Guard — validateRequestAtBoundary", () => {
  it("passes with valid request", () => {
    expect(() => validateRequestAtBoundary(makeRequest())).not.toThrow();
  });

  describe("tenant context validation", () => {
    it("rejects missing tenantContext", () => {
      const req = makeRequest();
      (req as any).tenantContext = null;
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingTenantContextError);
    });

    it("rejects empty tenantId", () => {
      const tc = makeTenantContext({ tenantId: "" });
      const mc = makeModuleContext({ tenantContext: tc });
      const req = makeRequest({ moduleExecutionContext: mc, tenantContext: tc });
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingTenantContextError);
    });

    it("rejects whitespace-only tenantId", () => {
      const tc = makeTenantContext({ tenantId: "   " });
      const mc = makeModuleContext({ tenantContext: tc });
      const req = makeRequest({ moduleExecutionContext: mc, tenantContext: tc });
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingTenantContextError);
    });

    it("rejects invalid source", () => {
      const tc = makeTenantContext({ source: "unknown" as any });
      const mc = makeModuleContext({ tenantContext: tc });
      const req = makeRequest({ moduleExecutionContext: mc, tenantContext: tc });
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingTenantContextError);
    });
  });

  describe("module context validation", () => {
    it("rejects missing moduleExecutionContext", () => {
      const req = makeRequest();
      (req as any).moduleExecutionContext = null;
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingModuleContextError);
    });

    it("rejects empty moduleId", () => {
      const mc = makeModuleContext({ moduleId: "" });
      const req = makeRequest({ moduleExecutionContext: mc });
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingModuleContextError);
    });

    it("rejects empty moduleRootPath", () => {
      const mc = makeModuleContext({ moduleRootPath: "" });
      const req = makeRequest({ moduleExecutionContext: mc });
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingModuleContextError);
    });

    it("rejects missing capabilityProfile", () => {
      const mc = makeModuleContext({ capabilityProfile: "" as any });
      const req = makeRequest({ moduleExecutionContext: mc });
      expect(() => validateRequestAtBoundary(req)).toThrow(MissingModuleContextError);
    });
  });

  describe("cross-tenant execution attempts", () => {
    it("rejects when request tenantId differs from module tenantId", () => {
      const topTc = makeTenantContext({ tenantId: "tenant-a" });
      const nestedTc = makeTenantContext({ tenantId: "tenant-b" });
      const mc = makeModuleContext({ tenantContext: nestedTc });
      const req = makeRequest({
        tenantContext: topTc,
        moduleExecutionContext: mc,
      });
      expect(() => validateRequestAtBoundary(req)).toThrow(TenantContextMutationError);
      expect(() => validateRequestAtBoundary(req)).toThrow(/tenantId mismatch/);
    });

    it("rejects when source field is mutated between contexts", () => {
      const topTc: TenantContext = { tenantId: "tenant-a", userId: "u1", source: "header" };
      const nestedTc: TenantContext = { tenantId: "tenant-a", userId: "u1", source: "system" };
      const mc = makeModuleContext({ tenantContext: nestedTc });
      const req = makeRequest({
        tenantContext: topTc,
        moduleExecutionContext: mc,
      });
      expect(() => validateRequestAtBoundary(req)).toThrow(TenantContextMutationError);
      expect(() => validateRequestAtBoundary(req)).toThrow(/source mismatch/);
    });

    it("rejects when nested tenantContext is missing", () => {
      const topTc = makeTenantContext({ tenantId: "tenant-a" });
      const mc = makeModuleContext();
      (mc as any).tenantContext = undefined;
      const req = makeRequest({ tenantContext: topTc, moduleExecutionContext: mc });
      expect(() => validateRequestAtBoundary(req)).toThrow(TenantContextMutationError);
    });

    it("passes when both tenant contexts match", () => {
      const tc = makeTenantContext({ tenantId: "tenant-x" });
      const mc = makeModuleContext({ tenantContext: tc });
      const req = makeRequest({ tenantContext: tc, moduleExecutionContext: mc });
      expect(() => validateRequestAtBoundary(req)).not.toThrow();
    });
  });

  describe("capability enforcement", () => {
    it("rejects when requested capability is not in granted set", () => {
      const mc = makeModuleContext({ capabilities: ["fs:read"] });
      const req = makeRequest({
        moduleExecutionContext: mc,
        capabilities: ["fs:write"],
      });
      expect(() => validateRequestAtBoundary(req)).toThrow(CapabilityNotGrantedError);
      expect(() => validateRequestAtBoundary(req)).toThrow(/fs:write/);
    });

    it("rejects when one of multiple capabilities is not granted", () => {
      const mc = makeModuleContext({ capabilities: ["fs:read", "cmd:run"] });
      const req = makeRequest({
        moduleExecutionContext: mc,
        capabilities: ["fs:read", "net:http"],
      });
      expect(() => validateRequestAtBoundary(req)).toThrow(CapabilityNotGrantedError);
      expect(() => validateRequestAtBoundary(req)).toThrow(/net:http/);
    });

    it("passes when all requested capabilities are granted", () => {
      const mc = makeModuleContext({ capabilities: ["fs:read", "fs:write", "cmd:run"] });
      const req = makeRequest({
        moduleExecutionContext: mc,
        capabilities: ["fs:read", "cmd:run"],
      });
      expect(() => validateRequestAtBoundary(req)).not.toThrow();
    });

    it("passes with empty requested capabilities", () => {
      const req = makeRequest({ capabilities: [] });
      expect(() => validateRequestAtBoundary(req)).not.toThrow();
    });

    it("includes granted capabilities in error", () => {
      const mc = makeModuleContext({ capabilities: ["fs:read"] });
      const req = makeRequest({
        moduleExecutionContext: mc,
        capabilities: ["net:http"],
      });
      try {
        validateRequestAtBoundary(req);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CapabilityNotGrantedError);
        const e = err as CapabilityNotGrantedError;
        expect(e.capability).toBe("net:http");
        expect(e.grantedCapabilities).toEqual(["fs:read"]);
      }
    });
  });
});

describe("Module Boundary Escape Attempts — validateModuleBoundaryPath", () => {
  const moduleId = "mod-001";
  const moduleRoot = "src/components";

  it("allows paths within module root", () => {
    expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/components/Button.tsx")).not.toThrow();
    expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/components/sub/deep/file.ts")).not.toThrow();
  });

  it("allows exact module root path", () => {
    expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/components")).not.toThrow();
  });

  describe("path traversal attacks", () => {
    it("rejects ../  traversal", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "../etc/passwd")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects ../../ traversal", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "../../etc/shadow")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects traversal after valid prefix", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/components/../../etc/passwd")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects bare ..", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "..")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects path with /../ in middle", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/../../../etc/passwd")).toThrow(ModuleBoundaryEscapeError);
    });
  });

  describe("absolute path attacks", () => {
    it("rejects absolute unix path", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "/etc/passwd")).toThrow(ModuleBoundaryEscapeError);
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "/etc/passwd")).toThrow(/absolute path/);
    });

    it("rejects absolute path to root", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "/")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects absolute path even within module name", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "/src/components/file.ts")).toThrow(ModuleBoundaryEscapeError);
    });
  });

  describe("scope escape attempts", () => {
    it("rejects path outside module scope (sibling directory)", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/auth/secret.ts")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects path at project root outside module", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "package.json")).toThrow(ModuleBoundaryEscapeError);
    });

    it("rejects path with module name as prefix but different directory", () => {
      expect(() => validateModuleBoundaryPath(moduleId, moduleRoot, "src/components-evil/hack.ts")).toThrow(ModuleBoundaryEscapeError);
    });
  });

  describe("error type information", () => {
    it("includes moduleId in error", () => {
      try {
        validateModuleBoundaryPath(moduleId, moduleRoot, "/etc/passwd");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ModuleBoundaryEscapeError);
        const e = err as ModuleBoundaryEscapeError;
        expect(e.moduleId).toBe(moduleId);
        expect(e.moduleRootPath).toBe(moduleRoot);
        expect(e.attemptedPath).toBe("/etc/passwd");
        expect(e.errorType).toBe("MODULE_BOUNDARY_ESCAPE");
      }
    });
  });
});

describe("Boundary guard — required acceptance criteria", () => {
  it("cannot access ../ outside module rootPath", () => {
    expect(() =>
      validateModuleBoundaryPath("mod-001", "src/components", "src/components/../../etc/passwd")
    ).toThrow(ModuleBoundaryEscapeError);
  });

  it("cannot write without FS_WRITE capability", () => {
    const mc = makeModuleContext({ capabilities: ["fs:read", "cmd:run"] });
    const req = makeRequest({
      moduleExecutionContext: mc,
      capabilities: ["fs:write"],
    });
    expect(() => validateRequestAtBoundary(req)).toThrow(CapabilityNotGrantedError);
    expect(() => validateRequestAtBoundary(req)).toThrow(/fs:write/);
  });

  it("cannot run cmd without CMD_RUN capability", () => {
    const mc = makeModuleContext({ capabilities: ["fs:read"] });
    const req = makeRequest({
      moduleExecutionContext: mc,
      capabilities: ["cmd:run"],
    });
    expect(() => validateRequestAtBoundary(req)).toThrow(CapabilityNotGrantedError);
    expect(() => validateRequestAtBoundary(req)).toThrow(/cmd:run/);
  });
});
