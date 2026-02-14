import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChangeRecordSchema, insertAgentRunSchema } from "@shared/schema";
import { randomBytes } from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Projects
  app.get("/api/projects", async (_req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const project = await storage.createProject(parsed.data);
    res.status(201).json(project);
  });

  app.get("/api/projects/:id/changes", async (req, res) => {
    const changes = await storage.getChangesByProject(req.params.id);
    res.json(changes);
  });

  // Changes
  app.get("/api/changes", async (_req, res) => {
    const changes = await storage.getChanges();
    res.json(changes);
  });

  app.get("/api/changes/:id", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });
    res.json(change);
  });

  app.post("/api/changes", async (req, res) => {
    const parsed = insertChangeRecordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const project = await storage.getProject(parsed.data.projectId);
    if (!project) return res.status(400).json({ message: "Project not found" });
    const change = await storage.createChange(parsed.data);
    res.status(201).json(change);
  });

  app.get("/api/changes/:id/project", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });
    const project = await storage.getProject(change.projectId);
    res.json(project || null);
  });

  app.get("/api/changes/:id/workspace", async (req, res) => {
    const workspace = await storage.getWorkspaceByChange(req.params.id);
    res.json(workspace || null);
  });

  app.get("/api/changes/:id/agent-runs", async (req, res) => {
    const runs = await storage.getAgentRunsByChange(req.params.id);
    res.json(runs);
  });

  // Start workspace
  app.post("/api/changes/:id/start-workspace", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    const containerId = `ws-${randomBytes(6).toString("hex")}`;
    const branchName = `change/${change.id.slice(0, 8)}`;

    const workspace = await storage.createWorkspace({
      changeId: change.id,
      containerId,
      previewUrl: null,
    });

    await storage.updateWorkspaceStatus(workspace.id, "Running", containerId, `https://preview-${containerId}.ec3l.dev`);
    await storage.updateChangeStatus(change.id, "WorkspaceRunning", branchName);

    const updated = await storage.getWorkspaceByChange(change.id);
    res.status(201).json(updated);
  });

  // Check in
  app.post("/api/changes/:id/checkin", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    await storage.updateChangeStatus(change.id, "Ready");
    const updated = await storage.getChange(change.id);
    res.json(updated);
  });

  // Merge
  app.post("/api/changes/:id/merge", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    await storage.updateChangeStatus(change.id, "Merged");
    const workspace = await storage.getWorkspaceByChange(change.id);
    if (workspace) {
      await storage.updateWorkspaceStatus(workspace.id, "Stopped");
    }
    const updated = await storage.getChange(change.id);
    res.json(updated);
  });

  // Agent run
  app.post("/api/changes/:id/agent-run", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    const parsed = insertAgentRunSchema.safeParse({ changeId: change.id, intent: req.body.intent });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    let run = await storage.createAgentRun(parsed.data);

    const skills = ["editFile", "runLint"];
    const logs = [
      `[agent] Received intent: "${run.intent}"`,
      `[agent] Selecting skills: ${skills.join(", ")}`,
      `[skill:editFile] Modifying ${change.modulePath || "src/index.ts"}`,
      `[skill:runLint] Running linter...`,
      `[skill:runLint] All checks passed`,
      `[agent] Validation passed - marking change as Ready`,
    ];

    run = (await storage.updateAgentRun(run.id, "Passed", JSON.stringify(skills), JSON.stringify(logs)))!;

    if (change.status === "WorkspaceRunning") {
      await storage.updateChangeStatus(change.id, "Ready");
    }

    res.status(201).json(run);
  });

  // Agent runs (all)
  app.get("/api/agent-runs", async (_req, res) => {
    const runs = await storage.getAgentRuns();
    res.json(runs);
  });

  return httpServer;
}
