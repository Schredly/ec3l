import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { ChangeTarget, InsertChangeTarget } from "@shared/schema";

export class ChangeTargetServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ChangeTargetServiceError";
    this.statusCode = statusCode;
  }
}

const VALID_TARGET_TYPES = ["form", "workflow", "rule", "record_type", "script", "file"] as const;

function validateSelector(type: string, selector: unknown): void {
  if (selector === null || selector === undefined) {
    throw new ChangeTargetServiceError("selector is required");
  }
  if (typeof selector !== "object" || Array.isArray(selector)) {
    throw new ChangeTargetServiceError("selector must be a JSON object");
  }
  const s = selector as Record<string, unknown>;

  switch (type) {
    case "form":
      if (!s.formId || typeof s.formId !== "string") {
        throw new ChangeTargetServiceError('selector for type "form" requires a string "formId"');
      }
      break;
    case "workflow":
      if (!s.workflowDefinitionId || typeof s.workflowDefinitionId !== "string") {
        throw new ChangeTargetServiceError('selector for type "workflow" requires a string "workflowDefinitionId"');
      }
      break;
    case "rule":
      if (!s.ruleId || typeof s.ruleId !== "string") {
        throw new ChangeTargetServiceError('selector for type "rule" requires a string "ruleId"');
      }
      break;
    case "record_type":
      if (!s.recordTypeId || typeof s.recordTypeId !== "string") {
        throw new ChangeTargetServiceError('selector for type "record_type" requires a string "recordTypeId"');
      }
      break;
    case "script":
      if (!s.scriptPath || typeof s.scriptPath !== "string") {
        throw new ChangeTargetServiceError('selector for type "script" requires a string "scriptPath"');
      }
      break;
    case "file":
      if (!s.filePath || typeof s.filePath !== "string") {
        throw new ChangeTargetServiceError('selector for type "file" requires a string "filePath"');
      }
      break;
  }
}

export async function createChangeTarget(
  ctx: TenantContext,
  changeId: string,
  data: Omit<InsertChangeTarget, "tenantId" | "changeId" | "projectId">,
): Promise<ChangeTarget> {
  const ts = getTenantStorage(ctx);

  if (!VALID_TARGET_TYPES.includes(data.type as any)) {
    throw new ChangeTargetServiceError(`Invalid target type "${data.type}". Valid types: ${VALID_TARGET_TYPES.join(", ")}`);
  }

  validateSelector(data.type, data.selector);

  const change = await ts.getChange(changeId);
  if (!change) {
    throw new ChangeTargetServiceError("Change not found", 404);
  }

  if (change.status !== "Draft") {
    throw new ChangeTargetServiceError(
      `Cannot add targets to a change in status "${change.status}" — must be "Draft"`,
      409,
    );
  }

  const project = await ts.getProject(change.projectId);
  if (!project) {
    throw new ChangeTargetServiceError("Project not found for this change", 404);
  }

  return ts.createChangeTarget({
    tenantId: ctx.tenantId,
    projectId: change.projectId,
    changeId,
    type: data.type,
    selector: data.selector,
  });
}

export async function listChangeTargets(
  ctx: TenantContext,
  changeId: string,
): Promise<ChangeTarget[]> {
  const ts = getTenantStorage(ctx);
  return ts.getChangeTargetsByChange(changeId);
}
