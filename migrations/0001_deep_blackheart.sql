CREATE TYPE "public"."change_event_type" AS ENUM('change_status_changed', 'change_target_added', 'change_target_deleted', 'patch_op_added', 'patch_op_deleted', 'environment_release_created', 'environment_deployed');--> statement-breakpoint
CREATE TYPE "public"."environment_release_status" AS ENUM('created');--> statement-breakpoint
CREATE TYPE "public"."promotion_intent_status" AS ENUM('draft', 'previewed', 'approved', 'executed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."record_timer_status" AS ENUM('pending', 'breached', 'completed');--> statement-breakpoint
CREATE TYPE "public"."vibe_package_draft_status" AS ENUM('draft', 'previewed', 'installed', 'discarded');--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'workflow.intent.started';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'workflow.intent.completed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'workflow.intent.failed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'record.assigned';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'record.sla.created';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'record.sla.breached';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_intent_created';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_intent_previewed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_intent_approved';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_intent_executed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_intent_rejected';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.package_generated';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.package_installed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_created';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_refined';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_previewed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_installed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_generation_requested';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_generation_succeeded';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_generation_failed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_repair_attempted';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_refinement_requested';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_refinement_succeeded';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_refinement_failed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_discarded';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_patched';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_version_created';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_restored';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.variant_generation_requested';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.variant_generation_completed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_created_from_variant';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.variant_diff_computed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_variant_adopted';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_token_stream_started';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_token_stream_completed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.llm_token_stream_failed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'vibe.draft_version_diff_computed';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_notification_sent';--> statement-breakpoint
ALTER TYPE "public"."telemetry_event_type" ADD VALUE 'graph.promotion_notification_failed';--> statement-breakpoint
ALTER TYPE "public"."wf_intent_status" ADD VALUE 'running' BEFORE 'dispatched';--> statement-breakpoint
ALTER TYPE "public"."wf_intent_status" ADD VALUE 'completed' BEFORE 'dispatched';--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"change_id" varchar,
	"event_type" "change_event_type" NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_deployments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"environment_id" varchar NOT NULL,
	"release_id" varchar NOT NULL,
	"promoted_from_release_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_package_installs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"environment_id" varchar NOT NULL,
	"package_key" text NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"installed_by" text,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"diff" jsonb,
	"package_contents" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_release_changes" (
	"release_id" varchar NOT NULL,
	"change_id" varchar NOT NULL,
	CONSTRAINT "environment_release_changes_release_id_change_id_pk" PRIMARY KEY("release_id","change_id")
);
--> statement-breakpoint
CREATE TABLE "environment_releases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"environment_id" varchar NOT NULL,
	"created_by" varchar,
	"status" "environment_release_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_package_installs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"package_key" text NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"installed_by" text,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"diff" jsonb,
	"package_contents" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_intents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"from_environment_id" varchar NOT NULL,
	"to_environment_id" varchar NOT NULL,
	"status" "promotion_intent_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"diff" jsonb,
	"result" jsonb,
	"notification_status" text DEFAULT 'pending',
	"notification_last_error" text,
	"notification_last_attempt_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "record_instances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"record_type_id" varchar NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"assigned_to" text,
	"assigned_group" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_timers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"record_id" varchar NOT NULL,
	"type" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"status" "record_timer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vibe_package_draft_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"draft_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"reason" text NOT NULL,
	"package" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"preview_diff" jsonb,
	"preview_errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "vibe_package_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"environment_id" varchar,
	"status" "vibe_package_draft_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"prompt" text NOT NULL,
	"package" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"last_preview_diff" jsonb,
	"last_preview_errors" jsonb
);
--> statement-breakpoint
ALTER TABLE "record_types" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "requires_promotion_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "promotion_webhook_url" text;--> statement-breakpoint
ALTER TABLE "record_types" ADD COLUMN "assignment_config" jsonb;--> statement-breakpoint
ALTER TABLE "record_types" ADD COLUMN "sla_config" jsonb;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployments" ADD CONSTRAINT "environment_deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployments" ADD CONSTRAINT "environment_deployments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployments" ADD CONSTRAINT "environment_deployments_release_id_environment_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."environment_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployments" ADD CONSTRAINT "environment_deployments_promoted_from_release_id_environment_releases_id_fk" FOREIGN KEY ("promoted_from_release_id") REFERENCES "public"."environment_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_package_installs" ADD CONSTRAINT "environment_package_installs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_package_installs" ADD CONSTRAINT "environment_package_installs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_package_installs" ADD CONSTRAINT "environment_package_installs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_release_changes" ADD CONSTRAINT "environment_release_changes_release_id_environment_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."environment_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_release_changes" ADD CONSTRAINT "environment_release_changes_change_id_change_records_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."change_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_releases" ADD CONSTRAINT "environment_releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_releases" ADD CONSTRAINT "environment_releases_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_package_installs" ADD CONSTRAINT "graph_package_installs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_package_installs" ADD CONSTRAINT "graph_package_installs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_intents" ADD CONSTRAINT "promotion_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_intents" ADD CONSTRAINT "promotion_intents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_intents" ADD CONSTRAINT "promotion_intents_from_environment_id_environments_id_fk" FOREIGN KEY ("from_environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_intents" ADD CONSTRAINT "promotion_intents_to_environment_id_environments_id_fk" FOREIGN KEY ("to_environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_instances" ADD CONSTRAINT "record_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_instances" ADD CONSTRAINT "record_instances_record_type_id_record_types_id_fk" FOREIGN KEY ("record_type_id") REFERENCES "public"."record_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_timers" ADD CONSTRAINT "record_timers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_timers" ADD CONSTRAINT "record_timers_record_id_record_instances_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."record_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_package_draft_versions" ADD CONSTRAINT "vibe_package_draft_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_package_draft_versions" ADD CONSTRAINT "vibe_package_draft_versions_draft_id_vibe_package_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."vibe_package_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_package_drafts" ADD CONSTRAINT "vibe_package_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_package_drafts" ADD CONSTRAINT "vibe_package_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibe_package_drafts" ADD CONSTRAINT "vibe_package_drafts_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;