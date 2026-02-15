import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChangeRecordSchema, insertAgentRunSchema } from "@shared/schema";
import { runnerService } from "./runner";

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

    await storage.createModule({ projectId: project.id, name: "default", type: "code", rootPath: "src" });
    await storage.createEnvironment({ projectId: project.id, name: "dev", isDefault: true });
    await storage.createEnvironment({ projectId: project.id, name: "test", isDefault: false });
    await storage.createEnvironment({ projectId: project.id, name: "prod", isDefault: false });

    res.status(201).json(project);
  });

  app.get("/api/projects/:id/changes", async (req, res) => {
    const changes = await storage.getChangesByProject(req.params.id);
    res.json(changes);
  });

  app.get("/api/projects/:id/modules", async (req, res) => {
    const mods = await storage.getModulesByProject(req.params.id);
    res.json(mods);
  });

  app.get("/api/projects/:id/environments", async (req, res) => {
    const envs = await storage.getEnvironmentsByProject(req.params.id);
    res.json(envs);
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

    const data = { ...parsed.data };

    if (data.moduleId) {
      const mod = await storage.getModule(data.moduleId);
      if (!mod) return res.status(400).json({ message: "Module not found" });
      if (!data.modulePath) {
        data.modulePath = mod.rootPath;
      }
    } else if (data.modulePath) {
      let mod = await storage.getModuleByProjectAndPath(data.projectId, data.modulePath);
      if (!mod) {
        console.log(`[module-resolve] Auto-creating module for path "${data.modulePath}" in project ${data.projectId}`);
        const name = data.modulePath.split("/").pop() || "default";
        mod = await storage.createModule({
          projectId: data.projectId,
          name,
          type: "code",
          rootPath: data.modulePath,
        });
      } else {
        console.log(`[module-resolve] Resolved existing module "${mod.name}" (${mod.id}) for path "${data.modulePath}"`);
      }
      data.moduleId = mod.id;
    }

    if (!data.environmentId) {
      const defaultEnv = await storage.getDefaultEnvironment(data.projectId);
      if (defaultEnv) {
        data.environmentId = defaultEnv.id;
      }
    }

    const change = await storage.createChange(data);
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

  // Start workspace — control plane delegates to runner service
  app.post("/api/changes/:id/start-workspace", async (req, res) => {
    const change = await storage.getChange(req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    const workspace = await storage.createWorkspace({
      changeId: change.id,
      containerId: null,
      previewUrl: null,
    });

    const result = await runnerService.startWorkspace(workspace.id, change.moduleId ?? undefined);

    await storage.updateWorkspaceStatus(workspace.id, "Running", result.containerId, result.previewUrl);
    const branchName = `change/${change.id.slice(0, 8)}`;
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

  // Agent run — control plane creates record, simulates agent execution
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

  // Modules
  app.get("/api/modules", async (_req, res) => {
    const mods = await storage.getModules();
    res.json(mods);
  });

  // Environments
  app.get("/api/environments/:id", async (req, res) => {
    const env = await storage.getEnvironment(req.params.id);
    if (!env) return res.status(404).json({ message: "Environment not found" });
    res.json(env);
  });

  // Templates (read-only for now)
  app.get("/api/templates", async (_req, res) => {
    const temps = await storage.getTemplates();
    res.json(temps);
  });

  app.get("/api/templates/:id", async (req, res) => {
    const template = await storage.getTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  });

  app.get("/api/templates/:id/modules", async (req, res) => {
    const tms = await storage.getTemplateModules(req.params.id);
    res.json(tms);
  });

  return httpServer;
}
