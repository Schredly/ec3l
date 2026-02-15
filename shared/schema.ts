import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, boolean, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const changeStatusEnum = pgEnum("change_status", [
  "Draft",
  "WorkspaceRunning",
  "Validating",
  "ValidationFailed",
  "Ready",
  "Merged",
]);

export const workspaceStatusEnum = pgEnum("workspace_status", [
  "Pending",
  "Running",
  "Stopped",
  "Failed",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "Pending",
  "Running",
  "Passed",
  "Failed",
]);

export const moduleTypeEnum = pgEnum("module_type", [
  "code",
  "schema",
  "workflow",
  "ui",
  "integration",
]);

export const capabilityProfileEnum = pgEnum("capability_profile", [
  "CODE_MODULE_DEFAULT",
  "WORKFLOW_MODULE_DEFAULT",
  "READ_ONLY",
]);

export const environmentNameEnum = pgEnum("environment_name", [
  "dev",
  "test",
  "prod",
]);

export const templateDomainEnum = pgEnum("template_domain", [
  "HR",
  "Finance",
  "Legal",
  "Facilities",
  "Custom",
  "ITSM",
]);

export const installedAppStatusEnum = pgEnum("installed_app_status", [
  "installed",
  "upgrading",
  "failed",
]);

export const installEventTypeEnum = pgEnum("install_event_type", [
  "install_started",
  "install_completed",
  "install_failed",
]);

export const wfTriggerTypeEnum = pgEnum("wf_trigger_type", [
  "record_event",
  "schedule",
  "manual",
]);

export const wfDefinitionStatusEnum = pgEnum("wf_definition_status", [
  "draft",
  "active",
  "retired",
]);

export const wfStepTypeEnum = pgEnum("wf_step_type", [
  "assignment",
  "approval",
  "notification",
  "decision",
]);

export const wfExecutionStatusEnum = pgEnum("wf_execution_status", [
  "running",
  "paused",
  "completed",
  "failed",
]);

export const wfStepExecutionStatusEnum = pgEnum("wf_step_execution_status", [
  "pending",
  "awaiting_approval",
  "completed",
  "failed",
]);

export const wfTriggerStatusEnum = pgEnum("wf_trigger_status", [
  "active",
  "disabled",
]);

export const wfIntentStatusEnum = pgEnum("wf_intent_status", [
  "pending",
  "dispatched",
  "failed",
]);

export const overrideTypeEnum = pgEnum("override_type", [
  "workflow",
  "form",
  "rule",
  "config",
]);

export const overrideStatusEnum = pgEnum("override_status", [
  "draft",
  "active",
  "retired",
]);

// Phase 1: Tenant
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  githubRepo: text("github_repo").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  description: text("description"),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 2: Module
export const modules = pgTable("modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  type: moduleTypeEnum("type").notNull().default("code"),
  rootPath: text("root_path").notNull().default("src"),
  version: text("version").notNull().default("0.1.0"),
  capabilityProfile: capabilityProfileEnum("capability_profile").notNull().default("CODE_MODULE_DEFAULT"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const changeRecords = pgTable("change_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  baseSha: text("base_sha"),
  modulePath: text("module_path"),
  moduleId: varchar("module_id").references(() => modules.id),
  status: changeStatusEnum("status").notNull().default("Draft"),
  branchName: text("branch_name"),
  environmentId: varchar("environment_id").references(() => environments.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  changeId: varchar("change_id").notNull().references(() => changeRecords.id),
  containerId: text("container_id"),
  previewUrl: text("preview_url"),
  status: workspaceStatusEnum("status").notNull().default("Pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentRuns = pgTable("agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  changeId: varchar("change_id").notNull().references(() => changeRecords.id),
  intent: text("intent").notNull(),
  skillsUsed: text("skills_used").notNull().default("[]"),
  logs: text("logs").notNull().default("[]"),
  status: agentRunStatusEnum("status").notNull().default("Pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 4: Environment
export const environments = pgTable("environments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  name: environmentNameEnum("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 5: Template
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: templateDomainEnum("domain").notNull(),
  version: text("version").notNull().default("1.0.0"),
  description: text("description"),
  isGlobal: boolean("is_global").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const templateModules = pgTable("template_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  moduleType: moduleTypeEnum("module_type").notNull().default("code"),
  moduleName: text("module_name").notNull(),
  defaultCapabilityProfile: capabilityProfileEnum("default_capability_profile").notNull().default("CODE_MODULE_DEFAULT"),
  orderIndex: integer("order_index").notNull().default(0),
  metadata: jsonb("metadata"),
});

// Phase 6: Installed Apps
export const installedApps = pgTable("installed_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  templateVersion: text("template_version").notNull(),
  status: installedAppStatusEnum("status").notNull().default("upgrading"),
  installedAt: timestamp("installed_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_installed_apps_tenant_template").on(table.tenantId, table.templateId),
]);

export const installedModules = pgTable("installed_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  installedAppId: varchar("installed_app_id").notNull().references(() => installedApps.id),
  moduleId: varchar("module_id").notNull().references(() => modules.id),
  templateModuleId: varchar("template_module_id").notNull().references(() => templateModules.id),
  capabilityProfile: capabilityProfileEnum("capability_profile").notNull().default("CODE_MODULE_DEFAULT"),
  isOverride: boolean("is_override").notNull().default(false),
});

// Phase 7: Install Audit Events
export const installedAppEvents = pgTable("installed_app_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  installedAppId: varchar("installed_app_id").notNull().references(() => installedApps.id),
  templateId: varchar("template_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  eventType: installEventTypeEnum("event_type").notNull(),
  errorDetails: text("error_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 8: Module Overrides
export const moduleOverrides = pgTable("module_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  installedModuleId: varchar("installed_module_id").notNull().references(() => installedModules.id),
  overrideType: overrideTypeEnum("override_type").notNull(),
  targetRef: text("target_ref").notNull(),
  patch: jsonb("patch").notNull(),
  createdBy: text("created_by").notNull(),
  version: integer("version").notNull().default(1),
  status: overrideStatusEnum("status").notNull().default("draft"),
  changeId: varchar("change_id").references(() => changeRecords.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase 9: Workflow Engine
export const workflowDefinitions = pgTable("workflow_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  triggerType: wfTriggerTypeEnum("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config"),
  version: integer("version").notNull().default(1),
  status: wfDefinitionStatusEnum("status").notNull().default("draft"),
  changeId: varchar("change_id").references(() => changeRecords.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowSteps = pgTable("workflow_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowDefinitionId: varchar("workflow_definition_id").notNull().references(() => workflowDefinitions.id),
  stepType: wfStepTypeEnum("step_type").notNull(),
  config: jsonb("config").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const workflowExecutions = pgTable("workflow_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  workflowDefinitionId: varchar("workflow_definition_id").notNull().references(() => workflowDefinitions.id),
  status: wfExecutionStatusEnum("status").notNull().default("running"),
  input: jsonb("input"),
  accumulatedInput: jsonb("accumulated_input"),
  pausedAtStepId: varchar("paused_at_step_id").references(() => workflowSteps.id),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const workflowStepExecutions = pgTable("workflow_step_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowExecutionId: varchar("workflow_execution_id").notNull().references(() => workflowExecutions.id),
  workflowStepId: varchar("workflow_step_id").notNull().references(() => workflowSteps.id),
  status: wfStepExecutionStatusEnum("status").notNull().default("pending"),
  output: jsonb("output"),
  executedAt: timestamp("executed_at"),
});

// Phase 10: Workflow Triggers & Execution Intents
export const workflowTriggers = pgTable("workflow_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  workflowDefinitionId: varchar("workflow_definition_id").notNull().references(() => workflowDefinitions.id),
  triggerType: wfTriggerTypeEnum("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config"),
  status: wfTriggerStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowExecutionIntents = pgTable("workflow_execution_intents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  workflowDefinitionId: varchar("workflow_definition_id").notNull().references(() => workflowDefinitions.id),
  triggerType: wfTriggerTypeEnum("trigger_type").notNull(),
  triggerPayload: jsonb("trigger_payload"),
  status: wfIntentStatusEnum("status").notNull().default("pending"),
  executionId: varchar("execution_id").references(() => workflowExecutions.id),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  dispatchedAt: timestamp("dispatched_at"),
});

// Insert schemas
export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertModuleSchema = createInsertSchema(modules).omit({
  id: true,
  createdAt: true,
});

export const insertChangeRecordSchema = createInsertSchema(changeRecords).omit({
  id: true,
  createdAt: true,
  status: true,
  branchName: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertAgentRunSchema = createInsertSchema(agentRuns).omit({
  id: true,
  createdAt: true,
  status: true,
  skillsUsed: true,
  logs: true,
});

export const insertEnvironmentSchema = createInsertSchema(environments).omit({
  id: true,
  createdAt: true,
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
});

export const insertTemplateModuleSchema = createInsertSchema(templateModules).omit({
  id: true,
});

export const insertInstalledAppSchema = createInsertSchema(installedApps).omit({
  id: true,
  installedAt: true,
  status: true,
});

export const insertInstalledModuleSchema = createInsertSchema(installedModules).omit({
  id: true,
});

export const insertInstalledAppEventSchema = createInsertSchema(installedAppEvents).omit({
  id: true,
  createdAt: true,
});

export const insertModuleOverrideSchema = createInsertSchema(moduleOverrides).omit({
  id: true,
  createdAt: true,
  status: true,
  changeId: true,
});

export const insertWorkflowDefinitionSchema = createInsertSchema(workflowDefinitions).omit({
  id: true,
  createdAt: true,
  status: true,
  changeId: true,
});

export const insertWorkflowStepSchema = createInsertSchema(workflowSteps).omit({
  id: true,
});

export const insertWorkflowExecutionSchema = createInsertSchema(workflowExecutions).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  status: true,
  error: true,
  accumulatedInput: true,
  pausedAtStepId: true,
});

export const insertWorkflowStepExecutionSchema = createInsertSchema(workflowStepExecutions).omit({
  id: true,
  executedAt: true,
  status: true,
  output: true,
});

export const insertWorkflowTriggerSchema = createInsertSchema(workflowTriggers).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertWorkflowExecutionIntentSchema = createInsertSchema(workflowExecutionIntents).omit({
  id: true,
  createdAt: true,
  status: true,
  executionId: true,
  error: true,
  dispatchedAt: true,
});

// Types
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertModule = z.infer<typeof insertModuleSchema>;
export type Module = typeof modules.$inferSelect;

export type InsertChangeRecord = z.infer<typeof insertChangeRecordSchema>;
export type ChangeRecord = typeof changeRecords.$inferSelect;

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type AgentRun = typeof agentRuns.$inferSelect;

export type InsertEnvironment = z.infer<typeof insertEnvironmentSchema>;
export type Environment = typeof environments.$inferSelect;

export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;

export type InsertTemplateModule = z.infer<typeof insertTemplateModuleSchema>;
export type TemplateModule = typeof templateModules.$inferSelect;

export type InsertInstalledApp = z.infer<typeof insertInstalledAppSchema>;
export type InstalledApp = typeof installedApps.$inferSelect;

export type InsertInstalledModule = z.infer<typeof insertInstalledModuleSchema>;
export type InstalledModule = typeof installedModules.$inferSelect;

export type InsertInstalledAppEvent = z.infer<typeof insertInstalledAppEventSchema>;
export type InstalledAppEvent = typeof installedAppEvents.$inferSelect;

export type InsertModuleOverride = z.infer<typeof insertModuleOverrideSchema>;
export type ModuleOverride = typeof moduleOverrides.$inferSelect;

export type InsertWorkflowDefinition = z.infer<typeof insertWorkflowDefinitionSchema>;
export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;

export type InsertWorkflowStep = z.infer<typeof insertWorkflowStepSchema>;
export type WorkflowStep = typeof workflowSteps.$inferSelect;

export type InsertWorkflowExecution = z.infer<typeof insertWorkflowExecutionSchema>;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;

export type InsertWorkflowStepExecution = z.infer<typeof insertWorkflowStepExecutionSchema>;
export type WorkflowStepExecution = typeof workflowStepExecutions.$inferSelect;

export type InsertWorkflowTrigger = z.infer<typeof insertWorkflowTriggerSchema>;
export type WorkflowTrigger = typeof workflowTriggers.$inferSelect;

export type InsertWorkflowExecutionIntent = z.infer<typeof insertWorkflowExecutionIntentSchema>;
export type WorkflowExecutionIntent = typeof workflowExecutionIntents.$inferSelect;
