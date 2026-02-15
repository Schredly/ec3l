import type { ModuleExecutionContext } from "../moduleContext";
import type { Capability } from "../capabilities";
import { assertModuleCapability, CapabilityDeniedError, Capabilities } from "../capabilities";
import { createRunnerService } from "../runner";

const runnerService = createRunnerService();

export interface SkillInput {
  target?: string;
  command?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

export interface SkillOutput {
  success: boolean;
  logs: string[];
  [key: string]: unknown;
}

export interface SkillDefinition {
  name: string;
  requiredCapabilities: Capability[];
  execute(ctx: ModuleExecutionContext, input: SkillInput): Promise<SkillOutput>;
}

class SkillRegistryImpl {
  private skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  async invoke(name: string, ctx: ModuleExecutionContext, input: SkillInput): Promise<SkillOutput> {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill "${name}" is not registered.`);
    }

    for (const cap of skill.requiredCapabilities) {
      assertModuleCapability(ctx, cap);
    }

    return skill.execute(ctx, input);
  }
}

export const skillRegistry = new SkillRegistryImpl();

skillRegistry.register({
  name: "editFile",
  requiredCapabilities: [Capabilities.FS_READ, Capabilities.FS_WRITE],
  async execute(ctx, input) {
    const target = input.target || "src/index.ts";
    const result = await runnerService.runCommand(
      { workspaceId: input.workspaceId || "", command: `edit ${target}`, targetPath: target },
      ctx,
    );
    return { success: result.success, logs: result.logs };
  },
});

skillRegistry.register({
  name: "runCommand",
  requiredCapabilities: [Capabilities.CMD_RUN],
  async execute(ctx, input) {
    const command = input.command || "echo ok";
    const result = await runnerService.runCommand(
      { workspaceId: input.workspaceId || "", command, targetPath: input.target },
      ctx,
    );
    return { success: result.success, logs: result.logs };
  },
});

skillRegistry.register({
  name: "runLint",
  requiredCapabilities: [Capabilities.FS_READ, Capabilities.CMD_RUN],
  async execute(ctx, input) {
    const target = input.target || "src";
    const result = await runnerService.runCommand(
      { workspaceId: input.workspaceId || "", command: `lint ${target}`, targetPath: target },
      ctx,
    );
    return { success: result.success, logs: result.logs };
  },
});

skillRegistry.register({
  name: "getDiff",
  requiredCapabilities: [Capabilities.GIT_DIFF],
  async execute(ctx, input) {
    const result = await runnerService.getDiff(input.workspaceId || "", ctx);
    return { success: result.success, logs: result.logs };
  },
});

export const controlPlane = {
  startWorkspace(workspaceId: string, moduleCtx: ModuleExecutionContext) {
    return runnerService.startWorkspace(workspaceId, moduleCtx);
  },
};
