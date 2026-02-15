import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChangeRecordSchema, insertAgentRunSchema } from "@shared/schema";
import { tenantResolution } from "./middleware/tenant";
import type { SystemContext } from "./tenant";
import * as projectService from "./services/projectService";
import * as changeService from "./services/changeService";
import { ChangeServiceError } from "./services/changeService";
import * as workspaceService from "./services/workspaceService";
import * as agentRunService from "./services/agentRunService";
import * as moduleService from "./services/moduleService";
import * as environmentService from "./services/environmentService";
import * as templateService from "./services/templateService";

const systemCtx: SystemContext = { source: "system", reason: "read-only template access" };

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/tenants", async (_req, res) => {
    const tenantList = await storage.getTenants();
    res.json(tenantList);
  });

  app.use("/api", tenantResolution);

  // Projects — tenant-scoped via service layer
  app.get("/api/projects", async (req, res) => {
    const result = await projectService.getProjects(req.tenantContext);
    res.json(result);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await projectService.getProject(req.tenantContext, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const { tenantId: _ignored, ...rest } = parsed.data;
    const project = await projectService.createProject(req.tenantContext, rest);
    res.status(201).json(project);
  });

  app.get("/api/projects/:id/changes", async (req, res) => {
    const changes = await changeService.getChangesByProject(req.tenantContext, req.params.id);
    res.json(changes);
  });

  app.get("/api/projects/:id/modules", async (req, res) => {
    const mods = await moduleService.getModulesByProject(req.tenantContext, req.params.id);
    res.json(mods);
  });

  app.get("/api/projects/:id/environments", async (req, res) => {
    const envs = await environmentService.getEnvironmentsByProject(req.tenantContext, req.params.id);
    res.json(envs);
  });

  // Changes
  app.get("/api/changes", async (req, res) => {
    const changes = await changeService.getChanges(req.tenantContext);
    res.json(changes);
  });

  app.get("/api/changes/:id", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });
    res.json(change);
  });

  app.post("/api/changes", async (req, res) => {
    const parsed = insertChangeRecordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    try {
      const change = await changeService.createChange(req.tenantContext, parsed.data);
      res.status(201).json(change);
    } catch (err) {
      if (err instanceof ChangeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/changes/:id/project", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });
    const project = await projectService.getProject(req.tenantContext, change.projectId);
    res.json(project || null);
  });

  app.get("/api/changes/:id/workspace", async (req, res) => {
    const workspace = await workspaceService.getWorkspaceByChange(req.tenantContext, req.params.id);
    res.json(workspace || null);
  });

  app.get("/api/changes/:id/agent-runs", async (req, res) => {
    const runs = await agentRunService.getAgentRunsByChange(req.tenantContext, req.params.id);
    res.json(runs);
  });

  // Start workspace — control plane delegates to runner service
  app.post("/api/changes/:id/start-workspace", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    const updated = await workspaceService.startWorkspace(req.tenantContext, change);
    res.status(201).json(updated);
  });

  // Check in
  app.post("/api/changes/:id/checkin", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    await changeService.updateChangeStatus(req.tenantContext, change.id, "Ready");
    const updated = await changeService.getChange(req.tenantContext, change.id);
    res.json(updated);
  });

  // Merge
  app.post("/api/changes/:id/merge", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    await changeService.updateChangeStatus(req.tenantContext, change.id, "Merged");
    const workspace = await workspaceService.getWorkspaceByChange(req.tenantContext, change.id);
    if (workspace) {
      await workspaceService.stopWorkspace(req.tenantContext, workspace.id);
    }
    const updated = await changeService.getChange(req.tenantContext, change.id);
    res.json(updated);
  });

  // Agent run — with module-scoped permissions
  app.post("/api/changes/:id/agent-run", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    const parsed = insertAgentRunSchema.safeParse({ changeId: change.id, intent: req.body.intent });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const run = await agentRunService.createAgentRun(req.tenantContext, parsed.data, change);
    res.status(201).json(run);
  });

  // Agent runs (all)
  app.get("/api/agent-runs", async (req, res) => {
    const runs = await agentRunService.getAgentRuns(req.tenantContext);
    res.json(runs);
  });

  // Modules
  app.get("/api/modules", async (req, res) => {
    const mods = await moduleService.getModules(req.tenantContext);
    res.json(mods);
  });

  // Environments
  app.get("/api/environments/:id", async (req, res) => {
    const env = await environmentService.getEnvironment(req.tenantContext, req.params.id);
    if (!env) return res.status(404).json({ message: "Environment not found" });
    res.json(env);
  });

  // Templates (read-only, system context)
  app.get("/api/templates", async (_req, res) => {
    const temps = await templateService.systemGetTemplates(systemCtx);
    res.json(temps);
  });

  app.get("/api/templates/:id", async (req, res) => {
    const template = await templateService.systemGetTemplate(systemCtx, req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  });

  app.get("/api/templates/:id/modules", async (req, res) => {
    const tms = await templateService.systemGetTemplateModules(systemCtx, req.params.id);
    res.json(tms);
  });

  return httpServer;
}
