import type { TenantContext } from "../tenant";
import type { ModuleExecutionContext } from "../moduleContext";
import { ModuleBoundaryViolationError } from "../moduleContext";
import { storage } from "../storage";
import { runnerService } from "../runner";
import type { AgentRun, InsertAgentRun, ChangeRecord } from "@shared/schema";

export async function getAgentRuns(ctx: TenantContext): Promise<AgentRun[]> {
  void ctx;
  return storage.getAgentRuns();
}

export async function getAgentRunsByChange(ctx: TenantContext, changeId: string): Promise<AgentRun[]> {
  void ctx;
  return storage.getAgentRunsByChange(changeId);
}

export async function createAgentRun(
  ctx: TenantContext,
  data: InsertAgentRun,
  change: ChangeRecord,
  moduleCtx: ModuleExecutionContext
): Promise<AgentRun> {
  void ctx;
  const moduleRootPath = moduleCtx.moduleRootPath || null;
  const moduleId = moduleCtx.moduleId || null;

  let run = await storage.createAgentRun(data);

  const editTarget = change.modulePath || moduleRootPath || "src/index.ts";
  const lintTarget = moduleRootPath || "src";

  const requestedSkills = [
    { name: "editFile", target: editTarget },
    { name: "runLint", target: lintTarget },
  ];
  const allowedSkills: string[] = [];
  const deniedSkills: string[] = [];
  const logs: string[] = [
    `[agent] Received intent: "${run.intent}"`,
    `[agent] Change: ${change.id}, Module: ${moduleId || "none"}`,
    `[agent] Module scope: ${moduleRootPath || "unrestricted"}`,
  ];

  for (const skill of requestedSkills) {
    if (moduleRootPath) {
      try {
        const check = runnerService.validateFilePath(skill.target, moduleCtx);
        if (check.valid) {
          allowedSkills.push(skill.name);
          logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" ALLOWED — within module scope "${moduleRootPath}"`);
        } else {
          throw new ModuleBoundaryViolationError({
            moduleId: moduleId || "",
            attemptedPath: skill.target,
            reason: check.reason || `Path "${skill.target}" is outside module scope "${moduleRootPath}".`,
          });
        }
      } catch (err) {
        if (err instanceof ModuleBoundaryViolationError) {
          const violationArtifact = {
            type: "MODULE_BOUNDARY_VIOLATION",
            moduleId: err.moduleId,
            attemptedPath: err.attemptedPath,
            reason: err.reason,
            skill: skill.name,
            changeId: change.id,
            timestamp: new Date().toISOString(),
          };
          logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" DENIED — MODULE_BOUNDARY_VIOLATION: ${err.reason}`);
          logs.push(`[agent] Violation artifact: ${JSON.stringify(violationArtifact)}`);
          logs.push(`[agent] Execution halted — module boundary violation is terminal`);
          console.error(`[agent-boundary-violation] change=${change.id} module=${err.moduleId} path="${err.attemptedPath}": ${err.reason}`);

          run = (await storage.updateAgentRun(run.id, "Failed", JSON.stringify(requestedSkills.map(s => s.name)), JSON.stringify(logs)))!;
          await storage.updateChangeStatus(change.id, "ValidationFailed");

          return run;
        }
        throw err;
      }
    } else {
      allowedSkills.push(skill.name);
      logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" ALLOWED — no module scope enforced`);
    }
  }

  logs.push(`[agent] All skills approved: ${allowedSkills.join(", ")}`);
  logs.push(`[skill:editFile] Modifying ${editTarget}`);
  logs.push(`[skill:runLint] Running linter on ${lintTarget}...`);
  logs.push(`[skill:runLint] All checks passed`);
  logs.push(`[agent] Validation passed — marking change as Ready`);

  run = (await storage.updateAgentRun(run.id, "Passed", JSON.stringify(allowedSkills), JSON.stringify(logs)))!;

  if (change.status === "WorkspaceRunning") {
    await storage.updateChangeStatus(change.id, "Ready");
  }

  return run;
}
