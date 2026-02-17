import { eq, desc, and, asc } from "drizzle-orm";
import { db } from "./db";
import {
  projects,
  changeRecords,
  modules,
  environments,
  agentRuns,
  workspaces,
  agentProposals,
  workflowDefinitions,
  workflowSteps,
  workflowExecutions,
  workflowStepExecutions,
  workflowTriggers,
  workflowExecutionIntents,
  type Project,
  type InsertProject,
  type ChangeRecord,
  type InsertChangeRecord,
  type Module,
  type InsertModule,
  type Environment,
  type InsertEnvironment,
  type AgentRun,
  type InsertAgentRun,
  type Workspace,
  type InsertWorkspace,
  type AgentProposal,
  type InsertAgentProposal,
  type WorkflowDefinition,
  type InsertWorkflowDefinition,
  type WorkflowStep,
  type InsertWorkflowStep,
  type WorkflowExecution,
  type WorkflowStepExecution,
  type WorkflowTrigger,
  type InsertWorkflowTrigger,
  type WorkflowExecutionIntent,
  type InsertWorkflowExecutionIntent,
  changeTargets,
  type ChangeTarget,
  type InsertChangeTarget,
  changePatchOps,
  type ChangePatchOp,
  type InsertChangePatchOp,
  recordTypes,
  type RecordType,
  type InsertRecordType,
  recordTypeSnapshots,
  type RecordTypeSnapshot,
  type InsertRecordTypeSnapshot,
} from "@shared/schema";
import type { TenantContext } from "./tenant";

export function getTenantStorage(ctx: TenantContext) {
  const tenantId = ctx.tenantId;
  return {
    async getProjects(): Promise<Project[]> {
      return db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(projects.createdAt));
    },

    async getProject(id: string): Promise<Project | undefined> {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));
      return project;
    },

    async createProject(data: InsertProject): Promise<Project> {
      const [project] = await db
        .insert(projects)
        .values({ ...data, tenantId })
        .returning();
      return project;
    },

    async getChangesByProject(projectId: string): Promise<ChangeRecord[]> {
      const project = await this.getProject(projectId);
      if (!project) return [];
      return db
        .select()
        .from(changeRecords)
        .where(eq(changeRecords.projectId, projectId))
        .orderBy(desc(changeRecords.createdAt));
    },

    async getChanges(): Promise<ChangeRecord[]> {
      const rows = await db
        .select({ change: changeRecords })
        .from(changeRecords)
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(changeRecords.createdAt));
      return rows.map((r) => r.change);
    },

    async getChange(id: string): Promise<ChangeRecord | undefined> {
      const [row] = await db
        .select({ change: changeRecords })
        .from(changeRecords)
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(and(eq(changeRecords.id, id), eq(projects.tenantId, tenantId)));
      return row?.change;
    },

    async updateChangeStatus(
      id: string,
      status: ChangeRecord["status"],
      branchName?: string,
    ): Promise<ChangeRecord | undefined> {
      const existing = await this.getChange(id);
      if (!existing) return undefined;
      const updates: Partial<ChangeRecord> = { status };
      if (branchName !== undefined) {
        updates.branchName = branchName;
      }
      const [change] = await db
        .update(changeRecords)
        .set(updates)
        .where(eq(changeRecords.id, id))
        .returning();
      return change;
    },

    async createChange(data: InsertChangeRecord): Promise<ChangeRecord> {
      const [change] = await db
        .insert(changeRecords)
        .values(data)
        .returning();
      return change;
    },

    async getModule(id: string): Promise<Module | undefined> {
      const [row] = await db
        .select({ module: modules })
        .from(modules)
        .innerJoin(projects, eq(modules.projectId, projects.id))
        .where(and(eq(modules.id, id), eq(projects.tenantId, tenantId)));
      return row?.module;
    },

    async getModuleByProjectAndPath(
      projectId: string,
      rootPath: string,
    ): Promise<Module | undefined> {
      const project = await this.getProject(projectId);
      if (!project) return undefined;
      const [mod] = await db
        .select()
        .from(modules)
        .where(
          and(eq(modules.projectId, projectId), eq(modules.rootPath, rootPath)),
        );
      return mod;
    },

    async createModule(data: InsertModule): Promise<Module> {
      const [mod] = await db.insert(modules).values(data).returning();
      return mod;
    },

    async getDefaultEnvironment(
      projectId: string,
    ): Promise<Environment | undefined> {
      const project = await this.getProject(projectId);
      if (!project) return undefined;
      const [env] = await db
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.projectId, projectId),
            eq(environments.isDefault, true),
          ),
        );
      return env;
    },

    // --- Modules (tenant-scoped) ---

    async getModules(): Promise<Module[]> {
      const rows = await db
        .select({ module: modules })
        .from(modules)
        .innerJoin(projects, eq(modules.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(modules.createdAt));
      return rows.map((r) => r.module);
    },

    async getModulesByProject(projectId: string): Promise<Module[]> {
      const project = await this.getProject(projectId);
      if (!project) return [];
      return db
        .select()
        .from(modules)
        .where(eq(modules.projectId, projectId))
        .orderBy(desc(modules.createdAt));
    },

    // --- Environments (tenant-scoped) ---

    async getEnvironmentsByProject(projectId: string): Promise<Environment[]> {
      const project = await this.getProject(projectId);
      if (!project) return [];
      return db
        .select()
        .from(environments)
        .where(eq(environments.projectId, projectId));
    },

    async getEnvironment(id: string): Promise<Environment | undefined> {
      const [row] = await db
        .select({ environment: environments })
        .from(environments)
        .innerJoin(projects, eq(environments.projectId, projects.id))
        .where(and(eq(environments.id, id), eq(projects.tenantId, tenantId)));
      return row?.environment;
    },

    async createEnvironment(data: InsertEnvironment): Promise<Environment> {
      const [env] = await db.insert(environments).values(data).returning();
      return env;
    },

    // --- Agent Runs (tenant-scoped) ---

    async getAgentRuns(): Promise<AgentRun[]> {
      const rows = await db
        .select({ agentRun: agentRuns })
        .from(agentRuns)
        .innerJoin(changeRecords, eq(agentRuns.changeId, changeRecords.id))
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(eq(projects.tenantId, tenantId))
        .orderBy(desc(agentRuns.createdAt));
      return rows.map((r) => r.agentRun);
    },

    async getAgentRunsByChange(changeId: string): Promise<AgentRun[]> {
      const change = await this.getChange(changeId);
      if (!change) return [];
      return db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.changeId, changeId))
        .orderBy(desc(agentRuns.createdAt));
    },

    async createAgentRun(data: InsertAgentRun): Promise<AgentRun> {
      const [run] = await db.insert(agentRuns).values(data).returning();
      return run;
    },

    async updateAgentRun(
      id: string,
      status: AgentRun["status"],
      skillsUsed?: string,
      logs?: string,
    ): Promise<AgentRun | undefined> {
      // Verify ownership via JOIN
      const [owned] = await db
        .select({ agentRun: agentRuns })
        .from(agentRuns)
        .innerJoin(changeRecords, eq(agentRuns.changeId, changeRecords.id))
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(and(eq(agentRuns.id, id), eq(projects.tenantId, tenantId)));
      if (!owned) return undefined;
      const updates: Partial<AgentRun> = { status };
      if (skillsUsed !== undefined) updates.skillsUsed = skillsUsed;
      if (logs !== undefined) updates.logs = logs;
      const [run] = await db
        .update(agentRuns)
        .set(updates)
        .where(eq(agentRuns.id, id))
        .returning();
      return run;
    },

    // --- Workspaces (tenant-scoped) ---

    async getWorkspaceByChange(changeId: string): Promise<Workspace | undefined> {
      const change = await this.getChange(changeId);
      if (!change) return undefined;
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.changeId, changeId))
        .orderBy(desc(workspaces.createdAt));
      return workspace;
    },

    async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
      const [workspace] = await db.insert(workspaces).values(data).returning();
      return workspace;
    },

    async updateWorkspaceStatus(
      id: string,
      status: Workspace["status"],
      containerId?: string,
      previewUrl?: string,
    ): Promise<Workspace | undefined> {
      // Verify ownership via JOIN
      const [owned] = await db
        .select({ workspace: workspaces })
        .from(workspaces)
        .innerJoin(changeRecords, eq(workspaces.changeId, changeRecords.id))
        .innerJoin(projects, eq(changeRecords.projectId, projects.id))
        .where(and(eq(workspaces.id, id), eq(projects.tenantId, tenantId)));
      if (!owned) return undefined;
      const updates: Partial<Workspace> = { status };
      if (containerId !== undefined) updates.containerId = containerId;
      if (previewUrl !== undefined) updates.previewUrl = previewUrl;
      const [workspace] = await db
        .update(workspaces)
        .set(updates)
        .where(eq(workspaces.id, id))
        .returning();
      return workspace;
    },

    // --- Agent Proposals (tenant-scoped) ---

    async createAgentProposal(data: InsertAgentProposal): Promise<AgentProposal> {
      const [item] = await db
        .insert(agentProposals)
        .values({ ...data, tenantId })
        .returning();
      return item;
    },

    async getAgentProposal(id: string): Promise<AgentProposal | undefined> {
      const [item] = await db
        .select()
        .from(agentProposals)
        .where(and(eq(agentProposals.id, id), eq(agentProposals.tenantId, tenantId)));
      return item;
    },

    async getAgentProposalsByChange(changeId: string): Promise<AgentProposal[]> {
      const change = await this.getChange(changeId);
      if (!change) return [];
      return db
        .select()
        .from(agentProposals)
        .where(and(eq(agentProposals.changeId, changeId), eq(agentProposals.tenantId, tenantId)))
        .orderBy(desc(agentProposals.createdAt));
    },

    async getAgentProposalsByTenant(): Promise<AgentProposal[]> {
      return db
        .select()
        .from(agentProposals)
        .where(eq(agentProposals.tenantId, tenantId))
        .orderBy(desc(agentProposals.createdAt));
    },

    async updateAgentProposalStatus(
      id: string,
      status: AgentProposal["status"],
    ): Promise<AgentProposal | undefined> {
      const existing = await this.getAgentProposal(id);
      if (!existing) return undefined;
      const [item] = await db
        .update(agentProposals)
        .set({ status })
        .where(eq(agentProposals.id, id))
        .returning();
      return item;
    },

    // --- Workflow Definitions (tenant-scoped) ---

    async createWorkflowDefinition(data: InsertWorkflowDefinition): Promise<WorkflowDefinition> {
      const [wf] = await db
        .insert(workflowDefinitions)
        .values({ ...data, tenantId })
        .returning();
      return wf;
    },

    async getWorkflowDefinition(id: string): Promise<WorkflowDefinition | undefined> {
      const [wf] = await db
        .select()
        .from(workflowDefinitions)
        .where(and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.tenantId, tenantId)));
      return wf;
    },

    async getWorkflowDefinitionsByTenant(): Promise<WorkflowDefinition[]> {
      return db
        .select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.tenantId, tenantId))
        .orderBy(desc(workflowDefinitions.createdAt));
    },

    async updateWorkflowDefinitionStatus(
      id: string,
      status: WorkflowDefinition["status"],
    ): Promise<WorkflowDefinition | undefined> {
      const existing = await this.getWorkflowDefinition(id);
      if (!existing) return undefined;
      const [wf] = await db
        .update(workflowDefinitions)
        .set({ status })
        .where(eq(workflowDefinitions.id, id))
        .returning();
      return wf;
    },

    async updateWorkflowDefinitionChangeId(
      id: string,
      changeId: string,
    ): Promise<WorkflowDefinition | undefined> {
      const existing = await this.getWorkflowDefinition(id);
      if (!existing) return undefined;
      const [wf] = await db
        .update(workflowDefinitions)
        .set({ changeId })
        .where(eq(workflowDefinitions.id, id))
        .returning();
      return wf;
    },

    // --- Workflow Steps (tenant-scoped via definition) ---

    async createWorkflowStep(data: InsertWorkflowStep): Promise<WorkflowStep> {
      const def = await this.getWorkflowDefinition(data.workflowDefinitionId);
      if (!def) throw new Error("Workflow definition not found or does not belong to tenant");
      const [step] = await db.insert(workflowSteps).values(data).returning();
      return step;
    },

    async getWorkflowStepsByDefinition(defId: string): Promise<WorkflowStep[]> {
      const def = await this.getWorkflowDefinition(defId);
      if (!def) return [];
      return db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowDefinitionId, defId))
        .orderBy(asc(workflowSteps.orderIndex));
    },

    // --- Workflow Executions (tenant-scoped) ---

    async getWorkflowExecution(id: string): Promise<WorkflowExecution | undefined> {
      const [exec] = await db
        .select()
        .from(workflowExecutions)
        .where(and(eq(workflowExecutions.id, id), eq(workflowExecutions.tenantId, tenantId)));
      return exec;
    },

    async getWorkflowExecutionsByTenant(): Promise<WorkflowExecution[]> {
      return db
        .select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.tenantId, tenantId))
        .orderBy(desc(workflowExecutions.startedAt));
    },

    async getWorkflowStepExecutionsByExecution(execId: string): Promise<WorkflowStepExecution[]> {
      const exec = await this.getWorkflowExecution(execId);
      if (!exec) return [];
      return db
        .select()
        .from(workflowStepExecutions)
        .where(eq(workflowStepExecutions.workflowExecutionId, execId));
    },

    // --- Workflow Execution Intents (tenant-scoped) ---

    async createWorkflowExecutionIntent(data: InsertWorkflowExecutionIntent): Promise<WorkflowExecutionIntent> {
      if (data.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(workflowExecutionIntents)
          .where(eq(workflowExecutionIntents.idempotencyKey, data.idempotencyKey));
        if (existing) return existing;
      }
      const [intent] = await db
        .insert(workflowExecutionIntents)
        .values({ ...data, tenantId })
        .returning();
      return intent;
    },

    // --- Workflow Triggers (tenant-scoped) ---

    async createWorkflowTrigger(data: InsertWorkflowTrigger): Promise<WorkflowTrigger> {
      const [trigger] = await db
        .insert(workflowTriggers)
        .values({ ...data, tenantId })
        .returning();
      return trigger;
    },

    async getWorkflowTrigger(id: string): Promise<WorkflowTrigger | undefined> {
      const [trigger] = await db
        .select()
        .from(workflowTriggers)
        .where(and(eq(workflowTriggers.id, id), eq(workflowTriggers.tenantId, tenantId)));
      return trigger;
    },

    async getWorkflowTriggersByTenant(): Promise<WorkflowTrigger[]> {
      return db
        .select()
        .from(workflowTriggers)
        .where(eq(workflowTriggers.tenantId, tenantId))
        .orderBy(desc(workflowTriggers.createdAt));
    },

    async getWorkflowTriggersByDefinition(defId: string): Promise<WorkflowTrigger[]> {
      const def = await this.getWorkflowDefinition(defId);
      if (!def) return [];
      return db
        .select()
        .from(workflowTriggers)
        .where(eq(workflowTriggers.workflowDefinitionId, defId))
        .orderBy(desc(workflowTriggers.createdAt));
    },

    async updateWorkflowTriggerStatus(
      id: string,
      status: WorkflowTrigger["status"],
    ): Promise<WorkflowTrigger | undefined> {
      const existing = await this.getWorkflowTrigger(id);
      if (!existing) return undefined;
      const [trigger] = await db
        .update(workflowTriggers)
        .set({ status })
        .where(eq(workflowTriggers.id, id))
        .returning();
      return trigger;
    },

    async getActiveTriggersByTenantAndType(triggerType: string): Promise<WorkflowTrigger[]> {
      return db
        .select()
        .from(workflowTriggers)
        .where(
          and(
            eq(workflowTriggers.tenantId, tenantId),
            eq(workflowTriggers.triggerType, triggerType as any),
            eq(workflowTriggers.status, "active"),
          ),
        )
        .orderBy(desc(workflowTriggers.createdAt));
    },

    // --- Change Targets (tenant-scoped) ---

    async createChangeTarget(data: InsertChangeTarget): Promise<ChangeTarget> {
      const [target] = await db
        .insert(changeTargets)
        .values({ ...data, tenantId })
        .returning();
      return target;
    },

    async getChangeTargetsByChange(changeId: string): Promise<ChangeTarget[]> {
      const change = await this.getChange(changeId);
      if (!change) return [];
      return db
        .select()
        .from(changeTargets)
        .where(
          and(
            eq(changeTargets.changeId, changeId),
            eq(changeTargets.tenantId, tenantId),
          ),
        )
        .orderBy(desc(changeTargets.createdAt));
    },

    async getChangeTarget(id: string): Promise<ChangeTarget | undefined> {
      const [target] = await db
        .select()
        .from(changeTargets)
        .where(
          and(
            eq(changeTargets.id, id),
            eq(changeTargets.tenantId, tenantId),
          ),
        );
      return target;
    },


    // --- Change Patch Operations (tenant-scoped) ---

    async createChangePatchOp(data: InsertChangePatchOp): Promise<ChangePatchOp> {
      const [op] = await db
        .insert(changePatchOps)
        .values({ ...data, tenantId })
        .returning();
      return op;
    },

    async getChangePatchOpsByChange(changeId: string): Promise<ChangePatchOp[]> {
      const change = await this.getChange(changeId);
      if (!change) return [];
      return db
        .select()
        .from(changePatchOps)
        .where(
          and(
            eq(changePatchOps.changeId, changeId),
            eq(changePatchOps.tenantId, tenantId),
          ),
        )
        .orderBy(desc(changePatchOps.createdAt));
    },

    // --- Record Types (tenant-scoped) ---

    async createRecordType(data: InsertRecordType): Promise<RecordType> {
      const [rt] = await db
        .insert(recordTypes)
        .values({ ...data, tenantId })
        .returning();
      return rt;
    },

    async getRecordTypeByKey(key: string): Promise<RecordType | undefined> {
      const [rt] = await db
        .select()
        .from(recordTypes)
        .where(
          and(
            eq(recordTypes.tenantId, tenantId),
            eq(recordTypes.key, key),
          ),
        );
      return rt;
    },

    async listRecordTypes(): Promise<RecordType[]> {
      return db
        .select()
        .from(recordTypes)
        .where(eq(recordTypes.tenantId, tenantId))
        .orderBy(desc(recordTypes.createdAt));
    },

    async updateRecordTypeSchema(
      id: string,
      schema: unknown,
    ): Promise<RecordType | undefined> {
      const [existing] = await db
        .select()
        .from(recordTypes)
        .where(
          and(eq(recordTypes.id, id), eq(recordTypes.tenantId, tenantId)),
        );
      if (!existing) return undefined;
      const [updated] = await db
        .update(recordTypes)
        .set({ schema })
        .where(eq(recordTypes.id, id))
        .returning();
      return updated;
    },

    async updateChangePatchOpSnapshot(
      id: string,
      previousSnapshot: unknown,
    ): Promise<ChangePatchOp | undefined> {
      const [existing] = await db
        .select()
        .from(changePatchOps)
        .where(
          and(
            eq(changePatchOps.id, id),
            eq(changePatchOps.tenantId, tenantId),
          ),
        );
      if (!existing) return undefined;
      const [updated] = await db
        .update(changePatchOps)
        .set({ previousSnapshot, executedAt: new Date() })
        .where(eq(changePatchOps.id, id))
        .returning();
      return updated;
    },

    // --- Record Type Snapshots (tenant-scoped) ---

    async createRecordTypeSnapshot(data: InsertRecordTypeSnapshot): Promise<RecordTypeSnapshot> {
      const [snap] = await db
        .insert(recordTypeSnapshots)
        .values({ ...data, tenantId })
        .returning();
      return snap;
    },

    async getSnapshotsByChange(changeId: string): Promise<RecordTypeSnapshot[]> {
      return db
        .select()
        .from(recordTypeSnapshots)
        .where(
          and(
            eq(recordTypeSnapshots.changeId, changeId),
            eq(recordTypeSnapshots.tenantId, tenantId),
          ),
        )
        .orderBy(desc(recordTypeSnapshots.createdAt));
    },

    async getSnapshotByChangeAndKey(
      changeId: string,
      recordTypeKey: string,
    ): Promise<RecordTypeSnapshot | undefined> {
      const [snap] = await db
        .select()
        .from(recordTypeSnapshots)
        .where(
          and(
            eq(recordTypeSnapshots.changeId, changeId),
            eq(recordTypeSnapshots.recordTypeKey, recordTypeKey),
            eq(recordTypeSnapshots.tenantId, tenantId),
          ),
        );
      return snap;
    },
  };
}
