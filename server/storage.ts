import { eq, desc, and, asc } from "drizzle-orm";
import { db } from "./db";
import {
  tenants,
  projects,
  modules,
  changeRecords,
  workspaces,
  agentRuns,
  environments,
  templates,
  templateModules,
  installedApps,
  installedModules,
  installedAppEvents,
  moduleOverrides,
  workflowDefinitions,
  workflowSteps,
  workflowExecutions,
  workflowStepExecutions,
  workflowTriggers,
  workflowExecutionIntents,
  type Tenant,
  type InsertTenant,
  type Project,
  type InsertProject,
  type Module,
  type InsertModule,
  type ChangeRecord,
  type InsertChangeRecord,
  type Workspace,
  type InsertWorkspace,
  type AgentRun,
  type InsertAgentRun,
  type Environment,
  type InsertEnvironment,
  type Template,
  type InsertTemplate,
  type TemplateModule,
  type InsertTemplateModule,
  type InstalledApp,
  type InsertInstalledApp,
  type InstalledModule,
  type InsertInstalledModule,
  type InstalledAppEvent,
  type InsertInstalledAppEvent,
  type ModuleOverride,
  type InsertModuleOverride,
  type WorkflowDefinition,
  type InsertWorkflowDefinition,
  type WorkflowStep,
  type InsertWorkflowStep,
  type WorkflowExecution,
  type InsertWorkflowExecution,
  type WorkflowStepExecution,
  type InsertWorkflowStepExecution,
  type WorkflowTrigger,
  type InsertWorkflowTrigger,
  type WorkflowExecutionIntent,
  type InsertWorkflowExecutionIntent,
} from "@shared/schema";

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;

  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;

  getModules(): Promise<Module[]>;
  getModule(id: string): Promise<Module | undefined>;
  getModulesByProject(projectId: string): Promise<Module[]>;
  getModuleByProjectAndPath(projectId: string, rootPath: string): Promise<Module | undefined>;
  createModule(data: InsertModule): Promise<Module>;

  getChanges(): Promise<ChangeRecord[]>;
  getChange(id: string): Promise<ChangeRecord | undefined>;
  getChangesByProject(projectId: string): Promise<ChangeRecord[]>;
  createChange(data: InsertChangeRecord): Promise<ChangeRecord>;
  updateChangeStatus(id: string, status: ChangeRecord["status"], branchName?: string): Promise<ChangeRecord | undefined>;

  getWorkspaceByChange(changeId: string): Promise<Workspace | undefined>;
  createWorkspace(data: InsertWorkspace): Promise<Workspace>;
  updateWorkspaceStatus(id: string, status: Workspace["status"], containerId?: string, previewUrl?: string): Promise<Workspace | undefined>;

  getAgentRuns(): Promise<AgentRun[]>;
  getAgentRunsByChange(changeId: string): Promise<AgentRun[]>;
  createAgentRun(data: InsertAgentRun): Promise<AgentRun>;
  updateAgentRun(id: string, status: AgentRun["status"], skillsUsed?: string, logs?: string): Promise<AgentRun | undefined>;

  getEnvironmentsByProject(projectId: string): Promise<Environment[]>;
  getEnvironment(id: string): Promise<Environment | undefined>;
  getDefaultEnvironment(projectId: string): Promise<Environment | undefined>;
  createEnvironment(data: InsertEnvironment): Promise<Environment>;

  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(data: InsertTemplate): Promise<Template>;

  getTemplateModule(id: string): Promise<TemplateModule | undefined>;
  getTemplateModules(templateId: string): Promise<TemplateModule[]>;
  createTemplateModule(data: InsertTemplateModule): Promise<TemplateModule>;

  getInstalledApps(tenantId: string): Promise<InstalledApp[]>;
  getInstalledApp(id: string): Promise<InstalledApp | undefined>;
  getInstalledAppByTenantAndTemplate(tenantId: string, templateId: string): Promise<InstalledApp | undefined>;
  createInstalledApp(data: InsertInstalledApp): Promise<InstalledApp>;
  updateInstalledAppStatus(id: string, status: InstalledApp["status"]): Promise<InstalledApp | undefined>;

  getInstalledModule(id: string): Promise<InstalledModule | undefined>;
  getInstalledModules(installedAppId: string): Promise<InstalledModule[]>;
  createInstalledModule(data: InsertInstalledModule): Promise<InstalledModule>;
  deleteInstalledModulesByApp(installedAppId: string): Promise<void>;

  getInstalledAppEvents(installedAppId: string): Promise<InstalledAppEvent[]>;
  createInstalledAppEvent(data: InsertInstalledAppEvent): Promise<InstalledAppEvent>;

  getModuleOverride(id: string): Promise<ModuleOverride | undefined>;
  getModuleOverridesByInstalledModule(installedModuleId: string): Promise<ModuleOverride[]>;
  getActiveModuleOverrides(installedModuleId: string): Promise<ModuleOverride[]>;
  getModuleOverridesByTenant(tenantId: string): Promise<ModuleOverride[]>;
  createModuleOverride(data: InsertModuleOverride): Promise<ModuleOverride>;
  updateModuleOverrideStatus(id: string, status: ModuleOverride["status"]): Promise<ModuleOverride | undefined>;
  updateModuleOverrideChangeId(id: string, changeId: string): Promise<ModuleOverride | undefined>;

  getWorkflowDefinition(id: string): Promise<WorkflowDefinition | undefined>;
  getWorkflowDefinitionsByTenant(tenantId: string): Promise<WorkflowDefinition[]>;
  getActiveWorkflowDefinitionsByTenant(tenantId: string): Promise<WorkflowDefinition[]>;
  createWorkflowDefinition(data: InsertWorkflowDefinition): Promise<WorkflowDefinition>;
  updateWorkflowDefinitionStatus(id: string, status: WorkflowDefinition["status"]): Promise<WorkflowDefinition | undefined>;
  updateWorkflowDefinitionChangeId(id: string, changeId: string): Promise<WorkflowDefinition | undefined>;

  getWorkflowStep(id: string): Promise<WorkflowStep | undefined>;
  getWorkflowStepsByDefinition(workflowDefinitionId: string): Promise<WorkflowStep[]>;
  createWorkflowStep(data: InsertWorkflowStep): Promise<WorkflowStep>;

  getWorkflowExecution(id: string): Promise<WorkflowExecution | undefined>;
  getWorkflowExecutionsByTenant(tenantId: string): Promise<WorkflowExecution[]>;
  getWorkflowExecutionsByDefinition(workflowDefinitionId: string): Promise<WorkflowExecution[]>;
  createWorkflowExecution(data: InsertWorkflowExecution): Promise<WorkflowExecution>;
  updateWorkflowExecutionStatus(id: string, status: WorkflowExecution["status"], error?: string): Promise<WorkflowExecution | undefined>;
  pauseWorkflowExecution(id: string, pausedAtStepId: string, accumulatedInput: unknown): Promise<WorkflowExecution | undefined>;
  completeWorkflowExecution(id: string): Promise<WorkflowExecution | undefined>;

  getWorkflowStepExecution(id: string): Promise<WorkflowStepExecution | undefined>;
  getWorkflowStepExecutionsByExecution(workflowExecutionId: string): Promise<WorkflowStepExecution[]>;
  createWorkflowStepExecution(data: InsertWorkflowStepExecution): Promise<WorkflowStepExecution>;
  updateWorkflowStepExecution(id: string, status: WorkflowStepExecution["status"], output?: unknown): Promise<WorkflowStepExecution | undefined>;

  getWorkflowTrigger(id: string): Promise<WorkflowTrigger | undefined>;
  getWorkflowTriggersByTenant(tenantId: string): Promise<WorkflowTrigger[]>;
  getWorkflowTriggersByDefinition(workflowDefinitionId: string): Promise<WorkflowTrigger[]>;
  getActiveTriggersByTenantAndType(tenantId: string, triggerType: string): Promise<WorkflowTrigger[]>;
  createWorkflowTrigger(data: InsertWorkflowTrigger): Promise<WorkflowTrigger>;
  updateWorkflowTriggerStatus(id: string, status: WorkflowTrigger["status"]): Promise<WorkflowTrigger | undefined>;

  getWorkflowExecutionIntent(id: string): Promise<WorkflowExecutionIntent | undefined>;
  getWorkflowExecutionIntentsByTenant(tenantId: string): Promise<WorkflowExecutionIntent[]>;
  getPendingIntents(): Promise<WorkflowExecutionIntent[]>;
  createWorkflowExecutionIntent(data: InsertWorkflowExecutionIntent): Promise<WorkflowExecutionIntent>;
  updateIntentDispatched(id: string, executionId: string): Promise<WorkflowExecutionIntent | undefined>;
  updateIntentFailed(id: string, error: string): Promise<WorkflowExecutionIntent | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async getModules(): Promise<Module[]> {
    return db.select().from(modules).orderBy(desc(modules.createdAt));
  }

  async getModule(id: string): Promise<Module | undefined> {
    const [mod] = await db.select().from(modules).where(eq(modules.id, id));
    return mod;
  }

  async getModulesByProject(projectId: string): Promise<Module[]> {
    return db.select().from(modules).where(eq(modules.projectId, projectId)).orderBy(desc(modules.createdAt));
  }

  async getModuleByProjectAndPath(projectId: string, rootPath: string): Promise<Module | undefined> {
    const [mod] = await db.select().from(modules).where(
      and(eq(modules.projectId, projectId), eq(modules.rootPath, rootPath))
    );
    return mod;
  }

  async createModule(data: InsertModule): Promise<Module> {
    const [mod] = await db.insert(modules).values(data).returning();
    return mod;
  }

  async getChanges(): Promise<ChangeRecord[]> {
    return db.select().from(changeRecords).orderBy(desc(changeRecords.createdAt));
  }

  async getChange(id: string): Promise<ChangeRecord | undefined> {
    const [change] = await db.select().from(changeRecords).where(eq(changeRecords.id, id));
    return change;
  }

  async getChangesByProject(projectId: string): Promise<ChangeRecord[]> {
    return db.select().from(changeRecords).where(eq(changeRecords.projectId, projectId)).orderBy(desc(changeRecords.createdAt));
  }

  async createChange(data: InsertChangeRecord): Promise<ChangeRecord> {
    const [change] = await db.insert(changeRecords).values(data).returning();
    return change;
  }

  async updateChangeStatus(id: string, status: ChangeRecord["status"], branchName?: string): Promise<ChangeRecord | undefined> {
    const updates: Partial<ChangeRecord> = { status };
    if (branchName !== undefined) {
      updates.branchName = branchName;
    }
    const [change] = await db.update(changeRecords).set(updates).where(eq(changeRecords.id, id)).returning();
    return change;
  }

  async getWorkspaceByChange(changeId: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.changeId, changeId)).orderBy(desc(workspaces.createdAt));
    return workspace;
  }

  async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
    const [workspace] = await db.insert(workspaces).values(data).returning();
    return workspace;
  }

  async updateWorkspaceStatus(id: string, status: Workspace["status"], containerId?: string, previewUrl?: string): Promise<Workspace | undefined> {
    const updates: Partial<Workspace> = { status };
    if (containerId !== undefined) updates.containerId = containerId;
    if (previewUrl !== undefined) updates.previewUrl = previewUrl;
    const [workspace] = await db.update(workspaces).set(updates).where(eq(workspaces.id, id)).returning();
    return workspace;
  }

  async getAgentRuns(): Promise<AgentRun[]> {
    return db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt));
  }

  async getAgentRunsByChange(changeId: string): Promise<AgentRun[]> {
    return db.select().from(agentRuns).where(eq(agentRuns.changeId, changeId)).orderBy(desc(agentRuns.createdAt));
  }

  async createAgentRun(data: InsertAgentRun): Promise<AgentRun> {
    const [run] = await db.insert(agentRuns).values(data).returning();
    return run;
  }

  async updateAgentRun(id: string, status: AgentRun["status"], skillsUsed?: string, logs?: string): Promise<AgentRun | undefined> {
    const updates: Partial<AgentRun> = { status };
    if (skillsUsed !== undefined) updates.skillsUsed = skillsUsed;
    if (logs !== undefined) updates.logs = logs;
    const [run] = await db.update(agentRuns).set(updates).where(eq(agentRuns.id, id)).returning();
    return run;
  }

  async getEnvironmentsByProject(projectId: string): Promise<Environment[]> {
    return db.select().from(environments).where(eq(environments.projectId, projectId));
  }

  async getEnvironment(id: string): Promise<Environment | undefined> {
    const [env] = await db.select().from(environments).where(eq(environments.id, id));
    return env;
  }

  async getDefaultEnvironment(projectId: string): Promise<Environment | undefined> {
    const [env] = await db.select().from(environments).where(
      and(eq(environments.projectId, projectId), eq(environments.isDefault, true))
    );
    return env;
  }

  async createEnvironment(data: InsertEnvironment): Promise<Environment> {
    const [env] = await db.insert(environments).values(data).returning();
    return env;
  }

  async getTemplates(): Promise<Template[]> {
    return db.select().from(templates).orderBy(desc(templates.createdAt));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }

  async createTemplate(data: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(templates).values(data).returning();
    return template;
  }

  async getTemplateModule(id: string): Promise<TemplateModule | undefined> {
    const [tm] = await db.select().from(templateModules).where(eq(templateModules.id, id));
    return tm;
  }

  async getTemplateModules(templateId: string): Promise<TemplateModule[]> {
    return db.select().from(templateModules)
      .where(eq(templateModules.templateId, templateId))
      .orderBy(templateModules.orderIndex);
  }

  async createTemplateModule(data: InsertTemplateModule): Promise<TemplateModule> {
    const [tm] = await db.insert(templateModules).values(data).returning();
    return tm;
  }

  async getInstalledApps(tenantId: string): Promise<InstalledApp[]> {
    return db.select().from(installedApps)
      .where(eq(installedApps.tenantId, tenantId))
      .orderBy(desc(installedApps.installedAt));
  }

  async getInstalledApp(id: string): Promise<InstalledApp | undefined> {
    const [app] = await db.select().from(installedApps).where(eq(installedApps.id, id));
    return app;
  }

  async getInstalledAppByTenantAndTemplate(tenantId: string, templateId: string): Promise<InstalledApp | undefined> {
    const [app] = await db.select().from(installedApps).where(
      and(eq(installedApps.tenantId, tenantId), eq(installedApps.templateId, templateId))
    );
    return app;
  }

  async createInstalledApp(data: InsertInstalledApp): Promise<InstalledApp> {
    const [app] = await db.insert(installedApps).values(data).returning();
    return app;
  }

  async updateInstalledAppStatus(id: string, status: InstalledApp["status"]): Promise<InstalledApp | undefined> {
    const [app] = await db.update(installedApps).set({ status }).where(eq(installedApps.id, id)).returning();
    return app;
  }

  async getInstalledModule(id: string): Promise<InstalledModule | undefined> {
    const [mod] = await db.select().from(installedModules).where(eq(installedModules.id, id));
    return mod;
  }

  async getInstalledModules(installedAppId: string): Promise<InstalledModule[]> {
    return db.select().from(installedModules).where(eq(installedModules.installedAppId, installedAppId));
  }

  async createInstalledModule(data: InsertInstalledModule): Promise<InstalledModule> {
    const [mod] = await db.insert(installedModules).values(data).returning();
    return mod;
  }

  async deleteInstalledModulesByApp(installedAppId: string): Promise<void> {
    await db.delete(installedModules).where(eq(installedModules.installedAppId, installedAppId));
  }

  async getInstalledAppEvents(installedAppId: string): Promise<InstalledAppEvent[]> {
    return db.select().from(installedAppEvents)
      .where(eq(installedAppEvents.installedAppId, installedAppId))
      .orderBy(desc(installedAppEvents.createdAt));
  }

  async createInstalledAppEvent(data: InsertInstalledAppEvent): Promise<InstalledAppEvent> {
    const [event] = await db.insert(installedAppEvents).values(data).returning();
    return event;
  }

  async getModuleOverride(id: string): Promise<ModuleOverride | undefined> {
    const [override] = await db.select().from(moduleOverrides).where(eq(moduleOverrides.id, id));
    return override;
  }

  async getModuleOverridesByInstalledModule(installedModuleId: string): Promise<ModuleOverride[]> {
    return db.select().from(moduleOverrides)
      .where(eq(moduleOverrides.installedModuleId, installedModuleId))
      .orderBy(moduleOverrides.version);
  }

  async getActiveModuleOverrides(installedModuleId: string): Promise<ModuleOverride[]> {
    return db.select().from(moduleOverrides)
      .where(and(
        eq(moduleOverrides.installedModuleId, installedModuleId),
        eq(moduleOverrides.status, "active"),
      ))
      .orderBy(moduleOverrides.version);
  }

  async getModuleOverridesByTenant(tenantId: string): Promise<ModuleOverride[]> {
    return db.select().from(moduleOverrides)
      .where(eq(moduleOverrides.tenantId, tenantId))
      .orderBy(desc(moduleOverrides.createdAt));
  }

  async createModuleOverride(data: InsertModuleOverride): Promise<ModuleOverride> {
    const [override] = await db.insert(moduleOverrides).values(data).returning();
    return override;
  }

  async updateModuleOverrideStatus(id: string, status: ModuleOverride["status"]): Promise<ModuleOverride | undefined> {
    const [override] = await db.update(moduleOverrides).set({ status }).where(eq(moduleOverrides.id, id)).returning();
    return override;
  }

  async updateModuleOverrideChangeId(id: string, changeId: string): Promise<ModuleOverride | undefined> {
    const [override] = await db.update(moduleOverrides).set({ changeId }).where(eq(moduleOverrides.id, id)).returning();
    return override;
  }

  async getWorkflowDefinition(id: string): Promise<WorkflowDefinition | undefined> {
    const [wf] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, id));
    return wf;
  }

  async getWorkflowDefinitionsByTenant(tenantId: string): Promise<WorkflowDefinition[]> {
    return db.select().from(workflowDefinitions)
      .where(eq(workflowDefinitions.tenantId, tenantId))
      .orderBy(desc(workflowDefinitions.createdAt));
  }

  async getActiveWorkflowDefinitionsByTenant(tenantId: string): Promise<WorkflowDefinition[]> {
    return db.select().from(workflowDefinitions)
      .where(and(
        eq(workflowDefinitions.tenantId, tenantId),
        eq(workflowDefinitions.status, "active"),
      ))
      .orderBy(desc(workflowDefinitions.createdAt));
  }

  async createWorkflowDefinition(data: InsertWorkflowDefinition): Promise<WorkflowDefinition> {
    const [wf] = await db.insert(workflowDefinitions).values(data).returning();
    return wf;
  }

  async updateWorkflowDefinitionStatus(id: string, status: WorkflowDefinition["status"]): Promise<WorkflowDefinition | undefined> {
    const [wf] = await db.update(workflowDefinitions).set({ status }).where(eq(workflowDefinitions.id, id)).returning();
    return wf;
  }

  async updateWorkflowDefinitionChangeId(id: string, changeId: string): Promise<WorkflowDefinition | undefined> {
    const [wf] = await db.update(workflowDefinitions).set({ changeId }).where(eq(workflowDefinitions.id, id)).returning();
    return wf;
  }

  async getWorkflowStep(id: string): Promise<WorkflowStep | undefined> {
    const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.id, id));
    return step;
  }

  async getWorkflowStepsByDefinition(workflowDefinitionId: string): Promise<WorkflowStep[]> {
    return db.select().from(workflowSteps)
      .where(eq(workflowSteps.workflowDefinitionId, workflowDefinitionId))
      .orderBy(asc(workflowSteps.orderIndex));
  }

  async createWorkflowStep(data: InsertWorkflowStep): Promise<WorkflowStep> {
    const [step] = await db.insert(workflowSteps).values(data).returning();
    return step;
  }

  async getWorkflowExecution(id: string): Promise<WorkflowExecution | undefined> {
    const [exec] = await db.select().from(workflowExecutions).where(eq(workflowExecutions.id, id));
    return exec;
  }

  async getWorkflowExecutionsByTenant(tenantId: string): Promise<WorkflowExecution[]> {
    return db.select().from(workflowExecutions)
      .where(eq(workflowExecutions.tenantId, tenantId))
      .orderBy(desc(workflowExecutions.startedAt));
  }

  async getWorkflowExecutionsByDefinition(workflowDefinitionId: string): Promise<WorkflowExecution[]> {
    return db.select().from(workflowExecutions)
      .where(eq(workflowExecutions.workflowDefinitionId, workflowDefinitionId))
      .orderBy(desc(workflowExecutions.startedAt));
  }

  async createWorkflowExecution(data: InsertWorkflowExecution): Promise<WorkflowExecution> {
    const [exec] = await db.insert(workflowExecutions).values(data).returning();
    return exec;
  }

  async updateWorkflowExecutionStatus(id: string, status: WorkflowExecution["status"], error?: string): Promise<WorkflowExecution | undefined> {
    const updates: Partial<WorkflowExecution> = { status };
    if (error !== undefined) updates.error = error;
    if (status === "failed" || status === "completed") updates.completedAt = new Date();
    const [exec] = await db.update(workflowExecutions).set(updates).where(eq(workflowExecutions.id, id)).returning();
    return exec;
  }

  async pauseWorkflowExecution(id: string, pausedAtStepId: string, accumulatedInput: unknown): Promise<WorkflowExecution | undefined> {
    const [exec] = await db.update(workflowExecutions)
      .set({ status: "paused", pausedAtStepId, accumulatedInput })
      .where(eq(workflowExecutions.id, id))
      .returning();
    return exec;
  }

  async completeWorkflowExecution(id: string): Promise<WorkflowExecution | undefined> {
    const [exec] = await db.update(workflowExecutions)
      .set({ status: "completed", completedAt: new Date(), pausedAtStepId: null, accumulatedInput: null })
      .where(eq(workflowExecutions.id, id))
      .returning();
    return exec;
  }

  async getWorkflowStepExecution(id: string): Promise<WorkflowStepExecution | undefined> {
    const [stepExec] = await db.select().from(workflowStepExecutions).where(eq(workflowStepExecutions.id, id));
    return stepExec;
  }

  async getWorkflowStepExecutionsByExecution(workflowExecutionId: string): Promise<WorkflowStepExecution[]> {
    return db.select().from(workflowStepExecutions)
      .where(eq(workflowStepExecutions.workflowExecutionId, workflowExecutionId));
  }

  async createWorkflowStepExecution(data: InsertWorkflowStepExecution): Promise<WorkflowStepExecution> {
    const [stepExec] = await db.insert(workflowStepExecutions).values(data).returning();
    return stepExec;
  }

  async updateWorkflowStepExecution(id: string, status: WorkflowStepExecution["status"], output?: unknown): Promise<WorkflowStepExecution | undefined> {
    const updates: Partial<WorkflowStepExecution> = { status, executedAt: new Date() };
    if (output !== undefined) updates.output = output;
    const [stepExec] = await db.update(workflowStepExecutions).set(updates).where(eq(workflowStepExecutions.id, id)).returning();
    return stepExec;
  }

  async getWorkflowTrigger(id: string): Promise<WorkflowTrigger | undefined> {
    const [trigger] = await db.select().from(workflowTriggers).where(eq(workflowTriggers.id, id));
    return trigger;
  }

  async getWorkflowTriggersByTenant(tenantId: string): Promise<WorkflowTrigger[]> {
    return db.select().from(workflowTriggers)
      .where(eq(workflowTriggers.tenantId, tenantId))
      .orderBy(desc(workflowTriggers.createdAt));
  }

  async getWorkflowTriggersByDefinition(workflowDefinitionId: string): Promise<WorkflowTrigger[]> {
    return db.select().from(workflowTriggers)
      .where(eq(workflowTriggers.workflowDefinitionId, workflowDefinitionId))
      .orderBy(desc(workflowTriggers.createdAt));
  }

  async getActiveTriggersByTenantAndType(tenantId: string, triggerType: string): Promise<WorkflowTrigger[]> {
    return db.select().from(workflowTriggers)
      .where(and(
        eq(workflowTriggers.tenantId, tenantId),
        eq(workflowTriggers.triggerType, triggerType as any),
        eq(workflowTriggers.status, "active"),
      ))
      .orderBy(desc(workflowTriggers.createdAt));
  }

  async createWorkflowTrigger(data: InsertWorkflowTrigger): Promise<WorkflowTrigger> {
    const [trigger] = await db.insert(workflowTriggers).values(data).returning();
    return trigger;
  }

  async updateWorkflowTriggerStatus(id: string, status: WorkflowTrigger["status"]): Promise<WorkflowTrigger | undefined> {
    const [trigger] = await db.update(workflowTriggers).set({ status }).where(eq(workflowTriggers.id, id)).returning();
    return trigger;
  }

  async getWorkflowExecutionIntent(id: string): Promise<WorkflowExecutionIntent | undefined> {
    const [intent] = await db.select().from(workflowExecutionIntents).where(eq(workflowExecutionIntents.id, id));
    return intent;
  }

  async getWorkflowExecutionIntentsByTenant(tenantId: string): Promise<WorkflowExecutionIntent[]> {
    return db.select().from(workflowExecutionIntents)
      .where(eq(workflowExecutionIntents.tenantId, tenantId))
      .orderBy(desc(workflowExecutionIntents.createdAt));
  }

  async getPendingIntents(): Promise<WorkflowExecutionIntent[]> {
    return db.select().from(workflowExecutionIntents)
      .where(eq(workflowExecutionIntents.status, "pending"))
      .orderBy(asc(workflowExecutionIntents.createdAt));
  }

  async createWorkflowExecutionIntent(data: InsertWorkflowExecutionIntent): Promise<WorkflowExecutionIntent> {
    const [intent] = await db.insert(workflowExecutionIntents).values(data).returning();
    return intent;
  }

  async updateIntentDispatched(id: string, executionId: string): Promise<WorkflowExecutionIntent | undefined> {
    const [intent] = await db.update(workflowExecutionIntents)
      .set({ status: "dispatched", executionId, dispatchedAt: new Date() })
      .where(eq(workflowExecutionIntents.id, id))
      .returning();
    return intent;
  }

  async updateIntentFailed(id: string, error: string): Promise<WorkflowExecutionIntent | undefined> {
    const [intent] = await db.update(workflowExecutionIntents)
      .set({ status: "failed", error, dispatchedAt: new Date() })
      .where(eq(workflowExecutionIntents.id, id))
      .returning();
    return intent;
  }
}

export const storage = new DatabaseStorage();
