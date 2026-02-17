import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, boolean, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const changeStatusEnum = pgEnum("change_status", [
  "Draft",
  "Implementing",
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
  "application",
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
  "record_mutation",
  "record_lock",
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
  "duplicate",
]);

export const agentProposalTypeEnum = pgEnum("agent_proposal_type", [
  "form_patch",
  "workflow_change",
  "approval_comment",
]);

export const agentProposalStatusEnum = pgEnum("agent_proposal_status", [
  "draft",
  "submitted",
  "accepted",
  "rejected",
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

export const recordTypeStatusEnum = pgEnum("record_type_status", [
  "draft",
  "active",
  "retired",
]);

export const fieldTypeEnum = pgEnum("field_type", [
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "reference",
  "choice",
  "text",
]);

export const choiceListStatusEnum = pgEnum("choice_list_status", [
  "active",
  "disabled",
]);

export const formDefinitionStatusEnum = pgEnum("form_definition_status", [
  "draft",
  "active",
  "retired",
]);

export const formBehaviorRuleTypeEnum = pgEnum("form_behavior_rule_type", [
  "visible",
  "required",
  "readOnly",
]);

export const formBehaviorRuleStatusEnum = pgEnum("form_behavior_rule_status", [
  "active",
  "disabled",
]);

// RBAC enums
export const rbacRoleStatusEnum = pgEnum("rbac_role_status", [
  "active",
  "disabled",
]);

export const rbacPolicyEffectEnum = pgEnum("rbac_policy_effect", [
  "allow",
  "deny",
]);

export const rbacActorTypeEnum = pgEnum("rbac_actor_type", [
  "user",
  "agent",
  "system",
]);

export const rbacAuditOutcomeEnum = pgEnum("rbac_audit_outcome", [
  "allow",
  "deny",
]);

export const rbacResourceTypeEnum = pgEnum("rbac_resource_type", [
  "form",
  "workflow",
  "override",
  "change",
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
  intentId: varchar("intent_id"),
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
  idempotencyKey: text("idempotency_key"),
  status: wfIntentStatusEnum("status").notNull().default("pending"),
  executionId: varchar("execution_id").references(() => workflowExecutions.id),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  dispatchedAt: timestamp("dispatched_at"),
});

// Phase 11: Data Dictionary & Forms
export const recordTypes = pgTable("record_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  projectId: varchar("project_id").references(() => projects.id),
  name: text("name").notNull(),
  key: text("key"),
  description: text("description"),
  baseType: text("base_type"),
  schema: jsonb("schema"),
  version: integer("version").notNull().default(1),
  status: recordTypeStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_record_types_tenant_name").on(table.tenantId, table.name),
  unique("uq_record_types_tenant_project_key").on(table.tenantId, table.projectId, table.key),
]);

// Record Locks — metadata-level lock for records marked readOnly by workflow steps
export const recordLocks = pgTable("record_locks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  recordTypeId: varchar("record_type_id").notNull().references(() => recordTypes.id),
  recordId: varchar("record_id").notNull(),
  lockedBy: text("locked_by").notNull(),
  workflowExecutionId: varchar("workflow_execution_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_record_locks_tenant_type_record").on(table.tenantId, table.recordTypeId, table.recordId),
]);

// Agent Proposals — propose-only agent outputs linked to Change drafts
export const agentProposals = pgTable("agent_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  changeId: varchar("change_id").notNull().references(() => changeRecords.id),
  agentId: varchar("agent_id").notNull(),
  proposalType: agentProposalTypeEnum("proposal_type").notNull(),
  targetRef: text("target_ref").notNull(),
  payload: jsonb("payload").notNull(),
  summary: text("summary"),
  status: agentProposalStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Change Targets — constrain a change to specific scopes beyond modulePath
export const changeTargetTypeEnum = pgEnum("change_target_type", [
  "form",
  "workflow",
  "rule",
  "record_type",
  "script",
  "file",
]);

export const changeTargets = pgTable("change_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  changeId: varchar("change_id").notNull().references(() => changeRecords.id),
  type: changeTargetTypeEnum("type").notNull(),
  selector: jsonb("selector").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Change Patch Operations — structured output for targeted vibe coding
export const changePatchOps = pgTable("change_patch_ops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  changeId: varchar("change_id").notNull().references(() => changeRecords.id),
  targetId: varchar("target_id").notNull().references(() => changeTargets.id),
  opType: text("op_type").notNull(),
  payload: jsonb("payload").notNull(),
  previousSnapshot: jsonb("previous_snapshot"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const choiceLists = pgTable("choice_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  status: choiceListStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_choice_lists_tenant_name").on(table.tenantId, table.name),
]);

export const choiceItems = pgTable("choice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  choiceListId: varchar("choice_list_id").notNull().references(() => choiceLists.id),
  value: text("value").notNull(),
  label: text("label").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const fieldDefinitions = pgTable("field_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordTypeId: varchar("record_type_id").notNull().references(() => recordTypes.id),
  name: text("name").notNull(),
  label: text("label").notNull(),
  fieldType: fieldTypeEnum("field_type").notNull(),
  isRequired: boolean("is_required").notNull().default(false),
  defaultValue: jsonb("default_value"),
  choiceListId: varchar("choice_list_id").references(() => choiceLists.id),
  referenceRecordTypeId: varchar("reference_record_type_id").references(() => recordTypes.id),
  orderIndex: integer("order_index").notNull().default(0),
});

export const formDefinitions = pgTable("form_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  recordTypeId: varchar("record_type_id").notNull().references(() => recordTypes.id),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  status: formDefinitionStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("uq_form_definitions_tenant_record_name").on(table.tenantId, table.recordTypeId, table.name),
]);

export const formSections = pgTable("form_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formDefinitionId: varchar("form_definition_id").notNull().references(() => formDefinitions.id),
  title: text("title").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const formFieldPlacements = pgTable("form_field_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formSectionId: varchar("form_section_id").notNull().references(() => formSections.id),
  fieldDefinitionId: varchar("field_definition_id").notNull().references(() => fieldDefinitions.id),
  column: integer("column").notNull().default(1),
  orderIndex: integer("order_index").notNull().default(0),
});

export const formBehaviorRules = pgTable("form_behavior_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formDefinitionId: varchar("form_definition_id").notNull().references(() => formDefinitions.id),
  ruleType: formBehaviorRuleTypeEnum("rule_type").notNull(),
  targetFieldDefinitionId: varchar("target_field_definition_id").notNull().references(() => fieldDefinitions.id),
  condition: jsonb("condition").notNull(),
  value: boolean("value").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
  status: formBehaviorRuleStatusEnum("status").notNull().default("active"),
});

// --- RBAC Tables ---

export const rbacPermissions = pgTable("rbac_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export const rbacRoles = pgTable("rbac_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  status: rbacRoleStatusEnum("status").notNull().default("active"),
}, (table) => [
  unique("rbac_roles_tenant_name").on(table.tenantId, table.name),
]);

export const rbacRolePermissions = pgTable("rbac_role_permissions", {
  roleId: varchar("role_id").notNull().references(() => rbacRoles.id),
  permissionId: varchar("permission_id").notNull().references(() => rbacPermissions.id),
}, (table) => [
  unique("rbac_role_permission_unique").on(table.roleId, table.permissionId),
]);

export const rbacUserRoles = pgTable("rbac_user_roles", {
  userId: varchar("user_id").notNull(),
  roleId: varchar("role_id").notNull().references(() => rbacRoles.id),
}, (table) => [
  unique("rbac_user_role_unique").on(table.userId, table.roleId),
]);

export const rbacPolicies = pgTable("rbac_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  roleId: varchar("role_id").notNull().references(() => rbacRoles.id),
  resourceType: rbacResourceTypeEnum("resource_type").notNull(),
  resourceId: varchar("resource_id"),
  effect: rbacPolicyEffectEnum("effect").notNull(),
});

export const rbacAuditLogs = pgTable("rbac_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  actorType: rbacActorTypeEnum("actor_type").notNull(),
  actorId: varchar("actor_id"),
  permission: text("permission").notNull(),
  resourceType: text("resource_type"),
  resourceId: varchar("resource_id"),
  outcome: rbacAuditOutcomeEnum("outcome").notNull(),
  reason: text("reason"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
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

export const insertRecordLockSchema = createInsertSchema(recordLocks).omit({
  id: true,
  createdAt: true,
});

export const insertAgentProposalSchema = createInsertSchema(agentProposals).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertChangeTargetSchema = createInsertSchema(changeTargets).omit({
  id: true,
  createdAt: true,
});

export const insertChangePatchOpSchema = createInsertSchema(changePatchOps).omit({
  id: true,
  createdAt: true,
});

export const insertRecordTypeSchema = createInsertSchema(recordTypes).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertFieldDefinitionSchema = createInsertSchema(fieldDefinitions).omit({
  id: true,
});

export const insertChoiceListSchema = createInsertSchema(choiceLists).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertChoiceItemSchema = createInsertSchema(choiceItems).omit({
  id: true,
});

export const insertFormDefinitionSchema = createInsertSchema(formDefinitions).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertFormSectionSchema = createInsertSchema(formSections).omit({
  id: true,
});

export const insertFormFieldPlacementSchema = createInsertSchema(formFieldPlacements).omit({
  id: true,
});

export const insertFormBehaviorRuleSchema = createInsertSchema(formBehaviorRules).omit({
  id: true,
  status: true,
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

export type InsertAgentProposal = z.infer<typeof insertAgentProposalSchema>;
export type AgentProposal = typeof agentProposals.$inferSelect;

export type InsertChangeTarget = z.infer<typeof insertChangeTargetSchema>;
export type ChangeTarget = typeof changeTargets.$inferSelect;

export type InsertChangePatchOp = z.infer<typeof insertChangePatchOpSchema>;
export type ChangePatchOp = typeof changePatchOps.$inferSelect;

export type InsertRecordLock = z.infer<typeof insertRecordLockSchema>;
export type RecordLock = typeof recordLocks.$inferSelect;

export type InsertRecordType = z.infer<typeof insertRecordTypeSchema>;
export type RecordType = typeof recordTypes.$inferSelect;

export type InsertFieldDefinition = z.infer<typeof insertFieldDefinitionSchema>;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;

export type InsertChoiceList = z.infer<typeof insertChoiceListSchema>;
export type ChoiceList = typeof choiceLists.$inferSelect;

export type InsertChoiceItem = z.infer<typeof insertChoiceItemSchema>;
export type ChoiceItem = typeof choiceItems.$inferSelect;

export type InsertFormDefinition = z.infer<typeof insertFormDefinitionSchema>;
export type FormDefinition = typeof formDefinitions.$inferSelect;

export type InsertFormSection = z.infer<typeof insertFormSectionSchema>;
export type FormSection = typeof formSections.$inferSelect;

export type InsertFormFieldPlacement = z.infer<typeof insertFormFieldPlacementSchema>;
export type FormFieldPlacement = typeof formFieldPlacements.$inferSelect;

export type InsertFormBehaviorRule = z.infer<typeof insertFormBehaviorRuleSchema>;
export type FormBehaviorRule = typeof formBehaviorRules.$inferSelect;

export type RbacPermission = typeof rbacPermissions.$inferSelect;
export type RbacRole = typeof rbacRoles.$inferSelect;
export type RbacRolePermission = typeof rbacRolePermissions.$inferSelect;
export type RbacUserRole = typeof rbacUserRoles.$inferSelect;
export type RbacPolicy = typeof rbacPolicies.$inferSelect;

export type RbacAuditLog = typeof rbacAuditLogs.$inferSelect;

export type ActorIdentity =
  | { actorType: "user"; actorId: string }
  | { actorType: "agent"; actorId: string }
  | { actorType: "system"; actorId?: null };

export const insertRbacAuditLogSchema = createInsertSchema(rbacAuditLogs).omit({
  id: true,
  timestamp: true,
});
export type InsertRbacAuditLog = z.infer<typeof insertRbacAuditLogSchema>;

export const insertRbacRoleSchema = createInsertSchema(rbacRoles).omit({
  id: true,
  status: true,
});
export type InsertRbacRole = z.infer<typeof insertRbacRoleSchema>;

export const insertRbacPolicySchema = createInsertSchema(rbacPolicies).omit({
  id: true,
});
export type InsertRbacPolicy = z.infer<typeof insertRbacPolicySchema>;

// --- Execution Telemetry ---

export const telemetryEventTypeEnum = pgEnum("telemetry_event_type", [
  "execution_started",
  "execution_completed",
  "execution_failed",
]);

export const telemetryExecutionTypeEnum = pgEnum("telemetry_execution_type", [
  "workflow_step",
  "task",
  "agent_action",
]);

export const telemetryActorTypeEnum = pgEnum("telemetry_actor_type", [
  "user",
  "agent",
  "system",
]);

export const executionTelemetryEvents = pgTable("execution_telemetry_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: telemetryEventTypeEnum("event_type").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  moduleId: varchar("module_id").notNull(),
  executionType: telemetryExecutionTypeEnum("execution_type").notNull(),
  workflowId: varchar("workflow_id"),
  workflowStepId: varchar("workflow_step_id"),
  executionId: varchar("execution_id").notNull(),
  actorType: telemetryActorTypeEnum("actor_type").notNull(),
  actorId: varchar("actor_id"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  affectedRecordIds: jsonb("affected_record_ids"),
});

export const insertExecutionTelemetryEventSchema = createInsertSchema(executionTelemetryEvents).omit({
  id: true,
  timestamp: true,
});

export type InsertExecutionTelemetryEvent = z.infer<typeof insertExecutionTelemetryEventSchema>;
export type ExecutionTelemetryEvent = typeof executionTelemetryEvents.$inferSelect;

// --- Form Patch Operations (explicit, typed) ---

export const formPatchOperationTypes = [
  "moveField",
  "changeSection",
  "toggleRequired",
  "toggleReadOnly",
  "toggleVisible",
] as const;

export type FormPatchOperationType = typeof formPatchOperationTypes[number];

export const moveFieldPayloadSchema = z.object({
  targetFieldId: z.string(),
  sectionId: z.string(),
  orderIndex: z.number().int().min(0),
});

export const changeSectionPayloadSchema = z.object({
  targetFieldId: z.string(),
  fromSectionId: z.string(),
  toSectionId: z.string(),
  orderIndex: z.number().int().min(0),
});

export const toggleRequiredPayloadSchema = z.object({
  targetFieldId: z.string(),
  value: z.boolean(),
});

export const toggleReadOnlyPayloadSchema = z.object({
  targetFieldId: z.string(),
  value: z.boolean(),
});

export const toggleVisiblePayloadSchema = z.object({
  targetFieldId: z.string(),
  value: z.boolean(),
});

export const formPatchOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("moveField"), payload: moveFieldPayloadSchema }),
  z.object({ type: z.literal("changeSection"), payload: changeSectionPayloadSchema }),
  z.object({ type: z.literal("toggleRequired"), payload: toggleRequiredPayloadSchema }),
  z.object({ type: z.literal("toggleReadOnly"), payload: toggleReadOnlyPayloadSchema }),
  z.object({ type: z.literal("toggleVisible"), payload: toggleVisiblePayloadSchema }),
]);

export type FormPatchOperation = z.infer<typeof formPatchOperationSchema>;

export const formPatchOperationsSchema = z.object({
  operations: z.array(formPatchOperationSchema).min(1, "At least one operation is required"),
});

export type FormPatchOperations = z.infer<typeof formPatchOperationsSchema>;
