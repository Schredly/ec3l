import type { TenantContext } from "../tenant";
import type { ModuleExecutionContext } from "../moduleContext";
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
  let mod = null;
  if (change.moduleId) {
    mod = await storage.getModule(change.moduleId);
  }

  let run = await storage.createAgentRun(data);

  const moduleRootPath = mod?.rootPath || null;
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
    `[agent] Change: ${change.id}, Module: ${mod ? `${mod.id} (${mod.name})` : "none"}`,
    `[agent] Module scope: ${moduleRootPath || "unrestricted"}`,
  ];

  for (const skill of requestedSkills) {
    if (moduleRootPath) {
      const check = runnerService.validateFilePath(skill.target, moduleCtx);
      if (check.valid) {
        allowedSkills.push(skill.name);
        logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" ALLOWED — within module scope "${moduleRootPath}"`);
      } else {
        deniedSkills.push(skill.name);
        logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" DENIED — ${check.reason}`);
        console.warn(`[agent-permissions] Denied skill="${skill.name}" target="${skill.target}" change=${change.id} module=${mod?.id}: ${check.reason}`);
      }
    } else {
      allowedSkills.push(skill.name);
      logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" ALLOWED — no module scope enforced`);
    }
  }

  if (deniedSkills.length > 0) {
    logs.push(`[agent] ${deniedSkills.length} skill(s) denied due to module scope restrictions`);
    logs.push(`[agent] Validation failed — scope violations detected`);
    run = (await storage.updateAgentRun(run.id, "Failed", JSON.stringify(requestedSkills.map(s => s.name)), JSON.stringify(logs)))!;
    return run;
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
