import type { TenantContext } from "../tenant";
import type { ModuleExecutionContext } from "../moduleContext";
import { ModuleBoundaryViolationError } from "../moduleContext";
import { CapabilityDeniedError } from "../capabilities";
import { storage } from "../storage";
import { skillRegistry } from "../skills/registry";
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
  const executedSkills: string[] = [];
  const logs: string[] = [
    `[agent] Received intent: "${run.intent}"`,
    `[agent] Change: ${change.id}, Module: ${moduleId || "none"}`,
    `[agent] Module scope: ${moduleRootPath || "unrestricted"}`,
    `[agent] Profile: ${moduleCtx.capabilityProfile}`,
    `[agent] Capabilities: [${moduleCtx.capabilities.join(", ")}]`,
    `[agent] Context: ModuleExecutionContext`,
  ];

  for (const skill of requestedSkills) {
    try {
      const result = await skillRegistry.invoke(skill.name, moduleCtx, {
        target: skill.target,
        workspaceId: change.id,
      });
      executedSkills.push(skill.name);
      logs.push(`[agent] Skill "${skill.name}" target="${skill.target}" EXECUTED — ${result.success ? "success" : "failure"}`);
      logs.push(...result.logs);
    } catch (err) {
      if (err instanceof CapabilityDeniedError) {
        const denialArtifact = {
          type: "CAPABILITY_DENIED",
          skill: skill.name,
          requiredCapability: err.capability,
          moduleId: moduleId || "",
          tenantId: moduleCtx.tenantContext.tenantId,
          changeId: change.id,
          contextType: "ModuleExecutionContext" as const,
          capabilityProfile: moduleCtx.capabilityProfile,
          timestamp: new Date().toISOString(),
        };
        logs.push(`[agent] Skill "${skill.name}" DENIED — CAPABILITY_DENIED: ${err.message}`);
        logs.push(`[agent] Denial artifact: ${JSON.stringify(denialArtifact)}`);
        logs.push(`[agent] Execution halted — capability denial is terminal`);
        console.error(`[agent-capability-denied] change=${change.id} skill=${skill.name} cap="${err.capability}" module=${moduleId} tenant=${moduleCtx.tenantContext.tenantId}`);

        run = (await storage.updateAgentRun(run.id, "Failed", JSON.stringify(requestedSkills.map(s => s.name)), JSON.stringify(logs)))!;
        return run;
      }

      if (err instanceof ModuleBoundaryViolationError) {
        const violationArtifact = {
          type: "MODULE_BOUNDARY_VIOLATION",
          moduleId: err.moduleId,
          attemptedPath: err.attemptedPath,
          reason: err.reason,
          skill: skill.name,
          changeId: change.id,
          contextType: "ModuleExecutionContext" as const,
          capabilityProfile: moduleCtx.capabilityProfile,
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
  }

  logs.push(`[agent] All skills executed: ${executedSkills.join(", ")}`);
  logs.push(`[agent] Validation passed — marking change as Ready`);

  run = (await storage.updateAgentRun(run.id, "Passed", JSON.stringify(executedSkills), JSON.stringify(logs)))!;

  if (change.status === "WorkspaceRunning") {
    await storage.updateChangeStatus(change.id, "Ready");
  }

  return run;
}
