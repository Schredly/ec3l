import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  projects,
  changeRecords,
  workspaces,
  agentRuns,
  type Project,
  type InsertProject,
  type ChangeRecord,
  type InsertChangeRecord,
  type Workspace,
  type InsertWorkspace,
  type AgentRun,
  type InsertAgentRun,
} from "@shared/schema";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;

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
}

export class DatabaseStorage implements IStorage {
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
}

export const storage = new DatabaseStorage();
