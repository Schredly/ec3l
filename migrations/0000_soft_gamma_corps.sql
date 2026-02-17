CREATE TYPE "public"."agent_proposal_status" AS ENUM('draft', 'submitted', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."agent_proposal_type" AS ENUM('form_patch', 'workflow_change', 'approval_comment');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('Pending', 'Running', 'Passed', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."capability_profile" AS ENUM('CODE_MODULE_DEFAULT', 'WORKFLOW_MODULE_DEFAULT', 'READ_ONLY');--> statement-breakpoint
CREATE TYPE "public"."change_status" AS ENUM('Draft', 'Implementing', 'WorkspaceRunning', 'Validating', 'ValidationFailed', 'Ready', 'Merged');--> statement-breakpoint
CREATE TYPE "public"."change_target_type" AS ENUM('form', 'workflow', 'rule', 'record_type', 'script', 'file');--> statement-breakpoint
CREATE TYPE "public"."choice_list_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."environment_name" AS ENUM('dev', 'test', 'prod');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('string', 'number', 'boolean', 'date', 'datetime', 'reference', 'choice', 'text');--> statement-breakpoint
CREATE TYPE "public"."form_behavior_rule_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."form_behavior_rule_type" AS ENUM('visible', 'required', 'readOnly');--> statement-breakpoint
CREATE TYPE "public"."form_definition_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."install_event_type" AS ENUM('install_started', 'install_completed', 'install_failed');--> statement-breakpoint
CREATE TYPE "public"."installed_app_status" AS ENUM('installed', 'upgrading', 'failed');--> statement-breakpoint
CREATE TYPE "public"."module_type" AS ENUM('code', 'schema', 'workflow', 'ui', 'integration', 'application');--> statement-breakpoint
CREATE TYPE "public"."override_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."override_type" AS ENUM('workflow', 'form', 'rule', 'config');--> statement-breakpoint
CREATE TYPE "public"."rbac_actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."rbac_audit_outcome" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."rbac_policy_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."rbac_resource_type" AS ENUM('form', 'workflow', 'override', 'change');--> statement-breakpoint
CREATE TYPE "public"."rbac_role_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."record_type_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."telemetry_actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."telemetry_event_type" AS ENUM('execution_started', 'execution_completed', 'execution_failed');--> statement-breakpoint
CREATE TYPE "public"."telemetry_execution_type" AS ENUM('workflow_step', 'task', 'agent_action');--> statement-breakpoint
CREATE TYPE "public"."template_domain" AS ENUM('HR', 'Finance', 'Legal', 'Facilities', 'Custom', 'ITSM');--> statement-breakpoint
CREATE TYPE "public"."wf_definition_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."wf_execution_status" AS ENUM('running', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wf_intent_status" AS ENUM('pending', 'dispatched', 'failed', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."wf_step_execution_status" AS ENUM('pending', 'awaiting_approval', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wf_step_type" AS ENUM('assignment', 'approval', 'notification', 'decision', 'record_mutation', 'record_lock');--> statement-breakpoint
CREATE TYPE "public"."wf_trigger_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."wf_trigger_type" AS ENUM('record_event', 'schedule', 'manual');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('Pending', 'Running', 'Stopped', 'Failed');--> statement-breakpoint
CREATE TABLE "agent_proposals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"change_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"proposal_type" "agent_proposal_type" NOT NULL,
	"target_ref" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text,
	"status" "agent_proposal_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" varchar NOT NULL,
	"intent" text NOT NULL,
	"skills_used" text DEFAULT '[]' NOT NULL,
	"logs" text DEFAULT '[]' NOT NULL,
	"status" "agent_run_status" DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_patch_ops" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"change_id" varchar NOT NULL,
	"target_id" varchar NOT NULL,
	"op_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"previous_snapshot" jsonb,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"base_sha" text,
	"module_path" text,
	"module_id" varchar,
	"status" "change_status" DEFAULT 'Draft' NOT NULL,
	"branch_name" text,
	"environment_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_targets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"change_id" varchar NOT NULL,
	"type" "change_target_type" NOT NULL,
	"selector" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"choice_list_id" varchar NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choice_lists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"status" "choice_list_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_choice_lists_tenant_name" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" "environment_name" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_telemetry_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "telemetry_event_type" NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"module_id" varchar NOT NULL,
	"execution_type" "telemetry_execution_type" NOT NULL,
	"workflow_id" varchar,
	"workflow_step_id" varchar,
	"execution_id" varchar NOT NULL,
	"actor_type" "telemetry_actor_type" NOT NULL,
	"actor_id" varchar,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"affected_record_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type_id" varchar NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"field_type" "field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" jsonb,
	"choice_list_id" varchar,
	"reference_record_type_id" varchar,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_behavior_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_definition_id" varchar NOT NULL,
	"rule_type" "form_behavior_rule_type" NOT NULL,
	"target_field_definition_id" varchar NOT NULL,
	"condition" jsonb NOT NULL,
	"value" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "form_behavior_rule_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"record_type_id" varchar NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "form_definition_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_form_definitions_tenant_record_name" UNIQUE("tenant_id","record_type_id","name")
);
--> statement-breakpoint
CREATE TABLE "form_field_placements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_section_id" varchar NOT NULL,
	"field_definition_id" varchar NOT NULL,
	"column" integer DEFAULT 1 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_sections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_definition_id" varchar NOT NULL,
	"title" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installed_app_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installed_app_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"event_type" "install_event_type" NOT NULL,
	"error_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installed_apps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"template_version" text NOT NULL,
	"status" "installed_app_status" DEFAULT 'upgrading' NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_installed_apps_tenant_template" UNIQUE("tenant_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "installed_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installed_app_id" varchar NOT NULL,
	"module_id" varchar NOT NULL,
	"template_module_id" varchar NOT NULL,
	"capability_profile" "capability_profile" DEFAULT 'CODE_MODULE_DEFAULT' NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"installed_module_id" varchar NOT NULL,
	"override_type" "override_type" NOT NULL,
	"target_ref" text NOT NULL,
	"patch" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "override_status" DEFAULT 'draft' NOT NULL,
	"change_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" "module_type" DEFAULT 'code' NOT NULL,
	"root_path" text DEFAULT 'src' NOT NULL,
	"version" text DEFAULT '0.1.0' NOT NULL,
	"capability_profile" "capability_profile" DEFAULT 'CODE_MODULE_DEFAULT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"github_repo" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"description" text,
	"tenant_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"actor_type" "rbac_actor_type" NOT NULL,
	"actor_id" varchar,
	"permission" text NOT NULL,
	"resource_type" text,
	"resource_id" varchar,
	"outcome" "rbac_audit_outcome" NOT NULL,
	"reason" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "rbac_permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rbac_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"resource_type" "rbac_resource_type" NOT NULL,
	"resource_id" varchar,
	"effect" "rbac_policy_effect" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_role_permissions" (
	"role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL,
	CONSTRAINT "rbac_role_permission_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "rbac_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "rbac_role_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "rbac_roles_tenant_name" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "rbac_user_roles" (
	"user_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	CONSTRAINT "rbac_user_role_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "record_locks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"record_type_id" varchar NOT NULL,
	"record_id" varchar NOT NULL,
	"locked_by" text NOT NULL,
	"workflow_execution_id" varchar,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_record_locks_tenant_type_record" UNIQUE("tenant_id","record_type_id","record_id")
);
--> statement-breakpoint
CREATE TABLE "record_type_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"record_type_key" text NOT NULL,
	"change_id" varchar NOT NULL,
	"schema" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_rt_snapshot_change_key" UNIQUE("change_id","record_type_key")
);
--> statement-breakpoint
CREATE TABLE "record_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"key" text,
	"description" text,
	"base_type" text,
	"schema" jsonb DEFAULT '{"fields":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_type_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_record_types_tenant_name" UNIQUE("tenant_id","name"),
	CONSTRAINT "uq_record_types_tenant_project_key" UNIQUE("tenant_id","project_id","key")
);
--> statement-breakpoint
CREATE TABLE "template_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"module_type" "module_type" DEFAULT 'code' NOT NULL,
	"module_name" text NOT NULL,
	"default_capability_profile" "capability_profile" DEFAULT 'CODE_MODULE_DEFAULT' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" "template_domain" NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"description" text,
	"is_global" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"trigger_type" "wf_trigger_type" NOT NULL,
	"trigger_config" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "wf_definition_status" DEFAULT 'draft' NOT NULL,
	"change_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_execution_intents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workflow_definition_id" varchar NOT NULL,
	"trigger_type" "wf_trigger_type" NOT NULL,
	"trigger_payload" jsonb,
	"idempotency_key" text,
	"status" "wf_intent_status" DEFAULT 'pending' NOT NULL,
	"execution_id" varchar,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dispatched_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workflow_definition_id" varchar NOT NULL,
	"intent_id" varchar,
	"status" "wf_execution_status" DEFAULT 'running' NOT NULL,
	"input" jsonb,
	"accumulated_input" jsonb,
	"paused_at_step_id" varchar,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_step_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_execution_id" varchar NOT NULL,
	"workflow_step_id" varchar NOT NULL,
	"status" "wf_step_execution_status" DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"executed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" varchar NOT NULL,
	"step_type" "wf_step_type" NOT NULL,
	"config" jsonb NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_triggers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"workflow_definition_id" varchar NOT NULL,
	"trigger_type" "wf_trigger_type" NOT NULL,
	"trigger_config" jsonb,
	"status" "wf_trigger_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" varchar NOT NULL,
	"container_id" text,
	"preview_url" text,
	"status" "workspace_status" DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_patch_ops" ADD CONSTRAINT "change_patch_ops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_patch_ops" ADD CONSTRAINT "change_patch_ops_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_patch_ops" ADD CONSTRAINT "change_patch_ops_target_id_change_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."change_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_targets" ADD CONSTRAINT "change_targets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_targets" ADD CONSTRAINT "change_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_targets" ADD CONSTRAINT "change_targets_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choice_items" ADD CONSTRAINT "choice_items_choice_list_id_choice_lists_id_fk" FOREIGN KEY ("choice_list_id") REFERENCES "public"."choice_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choice_lists" ADD CONSTRAINT "choice_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_telemetry_events" ADD CONSTRAINT "execution_telemetry_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_record_type_id_record_types_id_fk" FOREIGN KEY ("record_type_id") REFERENCES "public"."record_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_choice_list_id_choice_lists_id_fk" FOREIGN KEY ("choice_list_id") REFERENCES "public"."choice_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_reference_record_type_id_record_types_id_fk" FOREIGN KEY ("reference_record_type_id") REFERENCES "public"."record_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_behavior_rules" ADD CONSTRAINT "form_behavior_rules_form_definition_id_form_definitions_id_fk" FOREIGN KEY ("form_definition_id") REFERENCES "public"."form_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_behavior_rules" ADD CONSTRAINT "form_behavior_rules_target_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("target_field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_record_type_id_record_types_id_fk" FOREIGN KEY ("record_type_id") REFERENCES "public"."record_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_placements" ADD CONSTRAINT "form_field_placements_form_section_id_form_sections_id_fk" FOREIGN KEY ("form_section_id") REFERENCES "public"."form_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field_placements" ADD CONSTRAINT "form_field_placements_field_definition_id_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_sections" ADD CONSTRAINT "form_sections_form_definition_id_form_definitions_id_fk" FOREIGN KEY ("form_definition_id") REFERENCES "public"."form_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_app_events" ADD CONSTRAINT "installed_app_events_installed_app_id_installed_apps_id_fk" FOREIGN KEY ("installed_app_id") REFERENCES "public"."installed_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_apps" ADD CONSTRAINT "installed_apps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_apps" ADD CONSTRAINT "installed_apps_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_modules" ADD CONSTRAINT "installed_modules_installed_app_id_installed_apps_id_fk" FOREIGN KEY ("installed_app_id") REFERENCES "public"."installed_apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_modules" ADD CONSTRAINT "installed_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_modules" ADD CONSTRAINT "installed_modules_template_module_id_template_modules_id_fk" FOREIGN KEY ("template_module_id") REFERENCES "public"."template_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_overrides" ADD CONSTRAINT "module_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_overrides" ADD CONSTRAINT "module_overrides_installed_module_id_installed_modules_id_fk" FOREIGN KEY ("installed_module_id") REFERENCES "public"."installed_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_overrides" ADD CONSTRAINT "module_overrides_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_policies" ADD CONSTRAINT "rbac_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_policies" ADD CONSTRAINT "rbac_policies_role_id_rbac_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."rbac_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_role_id_rbac_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."rbac_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_role_permissions" ADD CONSTRAINT "rbac_role_permissions_permission_id_rbac_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."rbac_permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_roles" ADD CONSTRAINT "rbac_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rbac_user_roles" ADD CONSTRAINT "rbac_user_roles_role_id_rbac_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."rbac_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_locks" ADD CONSTRAINT "record_locks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_locks" ADD CONSTRAINT "record_locks_record_type_id_record_types_id_fk" FOREIGN KEY ("record_type_id") REFERENCES "public"."record_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_type_snapshots" ADD CONSTRAINT "record_type_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_type_snapshots" ADD CONSTRAINT "record_type_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_type_snapshots" ADD CONSTRAINT "record_type_snapshots_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_types" ADD CONSTRAINT "record_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_types" ADD CONSTRAINT "record_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_modules" ADD CONSTRAINT "template_modules_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_intents" ADD CONSTRAINT "workflow_execution_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_intents" ADD CONSTRAINT "workflow_execution_intents_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_intents" ADD CONSTRAINT "workflow_execution_intents_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_paused_at_step_id_workflow_steps_id_fk" FOREIGN KEY ("paused_at_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_workflow_step_id_workflow_steps_id_fk" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;