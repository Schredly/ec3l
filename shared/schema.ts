import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const changeStatusEnum = pgEnum("change_status", [
  "Draft",
  "WorkspaceRunning",
  "Validating",
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

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  githubRepo: text("github_repo").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const changeRecords = pgTable("change_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  baseSha: text("base_sha"),
  modulePath: text("module_path"),
  status: changeStatusEnum("status").notNull().default("Draft"),
  branchName: text("branch_name"),
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

export const insertProjectSchema = createInsertSchema(projects).omit({
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

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertChangeRecord = z.infer<typeof insertChangeRecordSchema>;
export type ChangeRecord = typeof changeRecords.$inferSelect;

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;
export type AgentRun = typeof agentRuns.$inferSelect;
