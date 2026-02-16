import path from "path";
import type { ExecutionRequest, ExecutionResult } from "./types";
import type { TenantContext } from "@shared/executionTypes";
import {
  MissingTenantContextError,
  MissingModuleContextError,
  CapabilityNotGrantedError,
  ModuleBoundaryEscapeError,
  TenantContextMutationError,
  RunnerBoundaryError,
} from "./boundaryErrors";

function validateTenantContext(tc: TenantContext | null | undefined): void {
  if (!tc) {
    throw new MissingTenantContextError("tenantContext is null or undefined");
  }
  if (!tc.tenantId || typeof tc.tenantId !== "string" || tc.tenantId.trim() === "") {
    throw new MissingTenantContextError("tenantId is missing or empty");
  }
  if (!tc.source || (tc.source !== "header" && tc.source !== "system")) {
    throw new MissingTenantContextError("tenantContext.source is invalid");
  }
}

function validateModuleContext(request: ExecutionRequest): void {
  const mc = request.moduleExecutionContext;
  if (!mc) {
    throw new MissingModuleContextError("moduleExecutionContext is null or undefined");
  }
  if (!mc.moduleId || typeof mc.moduleId !== "string" || mc.moduleId.trim() === "") {
    throw new MissingModuleContextError("moduleId is missing or empty");
  }
  if (!mc.moduleRootPath || typeof mc.moduleRootPath !== "string" || mc.moduleRootPath.trim() === "") {
    throw new MissingModuleContextError("moduleRootPath is missing or empty");
  }
  if (!mc.capabilityProfile || typeof mc.capabilityProfile !== "string") {
    throw new MissingModuleContextError("capabilityProfile is missing");
  }
}

function validateTenantImmutability(request: ExecutionRequest): void {
  const topLevel = request.tenantContext;
  const nested = request.moduleExecutionContext?.tenantContext;

  if (!nested) {
    throw new TenantContextMutationError(
      "moduleExecutionContext.tenantContext is missing",
    );
  }

  if (topLevel.tenantId !== nested.tenantId) {
    throw new TenantContextMutationError(
      `tenantId mismatch: request.tenantContext.tenantId="${topLevel.tenantId}" vs moduleExecutionContext.tenantContext.tenantId="${nested.tenantId}"`,
    );
  }

  if (topLevel.source !== nested.source) {
    throw new TenantContextMutationError(
      `source mismatch: request.tenantContext.source="${topLevel.source}" vs moduleExecutionContext.tenantContext.source="${nested.source}"`,
    );
  }
}

function validateCapabilities(request: ExecutionRequest): void {
  const granted = request.moduleExecutionContext.capabilities;
  for (const cap of request.capabilities) {
    if (!granted.includes(cap)) {
      throw new CapabilityNotGrantedError(cap, granted);
    }
  }
}

export function validateModuleBoundaryPath(
  moduleId: string,
  moduleRootPath: string,
  requestedPath: string,
): void {
  const normalized = path.posix.normalize(requestedPath);

  if (path.posix.isAbsolute(normalized)) {
    throw new ModuleBoundaryEscapeError({
      moduleId,
      moduleRootPath,
      attemptedPath: requestedPath,
      reason: `absolute path "${requestedPath}" is not allowed — paths must be relative to module root`,
    });
  }

  if (normalized.startsWith("..") || normalized.includes("/../") || normalized === "..") {
    throw new ModuleBoundaryEscapeError({
      moduleId,
      moduleRootPath,
      attemptedPath: requestedPath,
      reason: `path "${requestedPath}" contains path traversal — denied`,
    });
  }

  const normalizedRoot = path.posix.normalize(moduleRootPath).replace(/^\/+/, "").replace(/\/+$/, "");
  const normalizedReq = normalized.replace(/^\/+/, "").replace(/\/+$/, "");

  const resolved = path.posix.resolve(normalizedReq);
  const resolvedRoot = path.posix.resolve(normalizedRoot);

  if (!resolved.startsWith(resolvedRoot + "/") && resolved !== resolvedRoot) {
    throw new ModuleBoundaryEscapeError({
      moduleId,
      moduleRootPath,
      attemptedPath: requestedPath,
      reason: `path "${requestedPath}" resolves outside module scope "${moduleRootPath}" — denied`,
    });
  }
}

export function validateRequestAtBoundary(request: ExecutionRequest): void {
  validateTenantContext(request.tenantContext);
  validateModuleContext(request);
  validateTenantImmutability(request);
  validateCapabilities(request);
}

export function boundaryErrorToResult(err: unknown, method: string): ExecutionResult {
  if (err instanceof RunnerBoundaryError) {
    return {
      success: false,
      output: { errorType: err.errorType },
      logs: [`[runner-guard] ${method}: ${err.message}`],
      error: err.message,
    };
  }
  const msg = err instanceof Error ? err.message : "Unknown error";
  return {
    success: false,
    output: {},
    logs: [`[runner-guard] ${method}: unexpected error: ${msg}`],
    error: msg,
  };
}
