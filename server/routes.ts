import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChangeRecordSchema, insertAgentRunSchema, insertModuleOverrideSchema, insertWorkflowDefinitionSchema, insertWorkflowStepSchema } from "@shared/schema";
import { tenantResolution } from "./middleware/tenant";
import { buildModuleExecutionContext } from "./moduleContext";
import { ModuleBoundaryViolationError } from "./moduleContext";
import { CapabilityDeniedError } from "./capabilities";
import type { CapabilityProfileName } from "./capabilityProfiles";
import { PlatformContexts } from "./platformContext";
import * as projectService from "./services/projectService";
import * as changeService from "./services/changeService";
import { ChangeServiceError } from "./services/changeService";
import * as workspaceService from "./services/workspaceService";
import * as agentRunService from "./services/agentRunService";
import * as moduleService from "./services/moduleService";
import * as environmentService from "./services/environmentService";
import * as templateService from "./services/templateService";
import * as installService from "./services/installService";
import { InstallServiceError } from "./services/installService";
import * as overrideService from "./services/overrideService";
import { OverrideServiceError, OverridePatchValidationError } from "./services/overrideService";
import * as workflowService from "./services/workflowService";
import { WorkflowServiceError } from "./services/workflowService";
import * as triggerService from "./services/triggerService";
import { TriggerServiceError } from "./services/triggerService";
import { insertWorkflowTriggerSchema } from "@shared/schema";
import { dispatchPendingIntents } from "./services/intentDispatcher";
import { startScheduler } from "./services/schedulerService";

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

    if (change.status === "ValidationFailed") {
      return res.status(403).json({
        message: "Cannot start workspace on change — module boundary violation detected. A new Change is required.",
        failureReason: "MODULE_BOUNDARY_VIOLATION",
      });
    }

    let mod = null;
    if (change.moduleId) {
      mod = await storage.getModule(change.moduleId);
    }

    const moduleCtx = buildModuleExecutionContext({
      tenantContext: req.tenantContext,
      moduleId: change.moduleId ?? "",
      moduleRootPath: mod?.rootPath ?? "",
      capabilityProfile: (mod?.capabilityProfile as CapabilityProfileName) ?? "CODE_MODULE_DEFAULT",
    });

    const updated = await workspaceService.startWorkspace(req.tenantContext, change, moduleCtx);
    res.status(201).json(updated);
  });

  // Check in
  app.post("/api/changes/:id/checkin", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    if (change.status === "ValidationFailed") {
      return res.status(403).json({
        message: "Cannot promote change — module boundary violation detected. A new Change is required.",
        failureReason: "MODULE_BOUNDARY_VIOLATION",
      });
    }

    await changeService.updateChangeStatus(req.tenantContext, change.id, "Ready");
    const updated = await changeService.getChange(req.tenantContext, change.id);
    res.json(updated);
  });

  // Merge
  app.post("/api/changes/:id/merge", async (req, res) => {
    const change = await changeService.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    if (change.status === "ValidationFailed") {
      return res.status(403).json({
        message: "Cannot merge change — module boundary violation detected. A new Change is required.",
        failureReason: "MODULE_BOUNDARY_VIOLATION",
      });
    }

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

    if (change.status === "ValidationFailed") {
      return res.status(403).json({
        message: "Cannot run agent on change — module boundary violation detected. A new Change is required.",
        failureReason: "MODULE_BOUNDARY_VIOLATION",
      });
    }

    const parsed = insertAgentRunSchema.safeParse({ changeId: change.id, intent: req.body.intent });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    let mod = null;
    if (change.moduleId) {
      mod = await storage.getModule(change.moduleId);
    }

    const moduleCtx = buildModuleExecutionContext({
      tenantContext: req.tenantContext,
      moduleId: change.moduleId ?? "",
      moduleRootPath: mod?.rootPath ?? "",
      capabilityProfile: (mod?.capabilityProfile as CapabilityProfileName) ?? "CODE_MODULE_DEFAULT",
    });

    try {
      const run = await agentRunService.createAgentRun(req.tenantContext, parsed.data, change, moduleCtx);
      res.status(201).json(run);
    } catch (err) {
      if (err instanceof CapabilityDeniedError) {
        return res.status(403).json({
          message: "Agent run aborted — capability denied.",
          failureReason: "CAPABILITY_DENIED",
          capability: err.capability,
        });
      }
      if (err instanceof ModuleBoundaryViolationError) {
        return res.status(403).json({
          message: "Agent run aborted — module boundary violation.",
          failureReason: "MODULE_BOUNDARY_VIOLATION",
          violation: {
            moduleId: err.moduleId,
            attemptedPath: err.attemptedPath,
            reason: err.reason,
          },
        });
      }
      throw err;
    }
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
    const temps = await templateService.systemGetTemplates(PlatformContexts.templateRead());
    res.json(temps);
  });

  app.get("/api/templates/:id", async (req, res) => {
    const template = await templateService.systemGetTemplate(PlatformContexts.templateRead(), req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  });

  app.get("/api/templates/:id/modules", async (req, res) => {
    const tms = await templateService.systemGetTemplateModules(PlatformContexts.templateRead(), req.params.id);
    res.json(tms);
  });

  app.post("/api/templates/:id/install", async (req, res) => {
    try {
      const installed = await installService.installTemplateIntoTenant(
        PlatformContexts.templateInstall(),
        req.tenantContext.tenantId,
        req.params.id,
      );
      res.status(201).json(installed);
    } catch (err) {
      if (err instanceof InstallServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/installed-apps", async (req, res) => {
    const apps = await installService.getInstalledApps(
      PlatformContexts.installedAppsRead(),
      req.tenantContext.tenantId,
    );
    res.json(apps);
  });

  // Module Overrides — tenant-scoped
  app.get("/api/overrides", async (req, res) => {
    const overrides = await overrideService.getOverridesByTenant(req.tenantContext);
    res.json(overrides);
  });

  app.get("/api/overrides/:id", async (req, res) => {
    try {
      const override = await overrideService.getOverride(req.tenantContext, req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (err) {
      if (err instanceof OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/overrides", async (req, res) => {
    const parsed = insertModuleOverrideSchema.safeParse({
      ...req.body,
      tenantId: req.tenantContext.tenantId,
    });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    try {
      const override = await overrideService.createOverride(req.tenantContext, parsed.data);
      res.status(201).json(override);
    } catch (err) {
      if (err instanceof OverridePatchValidationError) {
        return res.status(err.statusCode).json({ message: err.message, violations: err.violations });
      }
      if (err instanceof OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/overrides/:id/activate", async (req, res) => {
    try {
      const override = await overrideService.activateOverride(req.tenantContext, req.params.id);
      res.json(override);
    } catch (err) {
      if (err instanceof OverridePatchValidationError) {
        return res.status(err.statusCode).json({ message: err.message, violations: err.violations });
      }
      if (err instanceof OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/overrides/:id/retire", async (req, res) => {
    try {
      const override = await overrideService.retireOverride(req.tenantContext, req.params.id);
      res.json(override);
    } catch (err) {
      if (err instanceof OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/installed-modules/:id/overrides", async (req, res) => {
    try {
      const overrides = await overrideService.getOverridesByInstalledModule(
        req.tenantContext,
        req.params.id,
      );
      res.json(overrides);
    } catch (err) {
      if (err instanceof OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/installed-modules/:id/resolve", async (req, res) => {
    try {
      const resolved = await overrideService.resolveModuleConfig(
        req.tenantContext,
        req.params.id,
      );
      res.json(resolved);
    } catch (err) {
      if (err instanceof OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions", async (req, res) => {
    try {
      const defs = await workflowService.getWorkflowDefinitions(req.tenantContext);
      res.json(defs);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions/:id", async (req, res) => {
    try {
      const def = await workflowService.getWorkflowDefinition(req.tenantContext, req.params.id);
      if (!def) return res.status(404).json({ message: "Workflow definition not found" });
      res.json(def);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions", async (req, res) => {
    try {
      const { projectId, moduleId, ...data } = req.body;
      if (!projectId) {
        return res.status(400).json({ message: "projectId is required" });
      }
      const parsed = insertWorkflowDefinitionSchema.omit({ tenantId: true }).parse(data);
      const def = await workflowService.createWorkflowDefinition(
        req.tenantContext,
        parsed,
        projectId,
        moduleId,
      );
      res.status(201).json(def);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/activate", async (req, res) => {
    try {
      const def = await workflowService.activateWorkflowDefinition(req.tenantContext, req.params.id);
      res.json(def);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/retire", async (req, res) => {
    try {
      const def = await workflowService.retireWorkflowDefinition(req.tenantContext, req.params.id);
      res.json(def);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions/:id/steps", async (req, res) => {
    try {
      const steps = await workflowService.getWorkflowSteps(req.tenantContext, req.params.id);
      res.json(steps);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/steps", async (req, res) => {
    try {
      const parsed = insertWorkflowStepSchema.omit({ workflowDefinitionId: true }).parse(req.body);
      const step = await workflowService.addWorkflowStep(
        req.tenantContext,
        req.params.id,
        parsed,
      );
      res.status(201).json(step);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/execute", async (req, res) => {
    try {
      const { moduleId, input } = req.body;
      if (!moduleId) {
        return res.status(400).json({ message: "moduleId is required" });
      }

      const mod = await storage.getModule(moduleId);
      if (!mod) {
        return res.status(404).json({ message: "Module not found" });
      }

      const moduleCtx = buildModuleExecutionContext({
        tenantContext: req.tenantContext,
        moduleId: mod.id,
        moduleRootPath: mod.rootPath,
        capabilityProfile: mod.capabilityProfile as any,
      });

      const execution = await workflowService.executeWorkflow(
        req.tenantContext,
        moduleCtx,
        req.params.id,
        input || {},
      );
      res.status(201).json(execution);
    } catch (err) {
      if (err instanceof CapabilityDeniedError) {
        return res.status(403).json({ message: err.message, capability: err.capability });
      }
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-executions", async (req, res) => {
    try {
      const execs = await workflowService.getWorkflowExecutions(req.tenantContext);
      res.json(execs);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-executions/:id", async (req, res) => {
    try {
      const exec = await workflowService.getWorkflowExecution(req.tenantContext, req.params.id);
      if (!exec) return res.status(404).json({ message: "Workflow execution not found" });
      res.json(exec);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-executions/:id/resume", async (req, res) => {
    try {
      const { moduleId, stepExecutionId, outcome } = req.body;
      if (!moduleId) {
        return res.status(400).json({ message: "moduleId is required" });
      }
      if (!stepExecutionId) {
        return res.status(400).json({ message: "stepExecutionId is required" });
      }
      if (!outcome || typeof outcome.approved !== "boolean") {
        return res.status(400).json({ message: "outcome with approved (boolean) is required" });
      }

      const mod = await storage.getModule(moduleId);
      if (!mod) {
        return res.status(404).json({ message: "Module not found" });
      }

      const moduleCtx = buildModuleExecutionContext({
        tenantContext: req.tenantContext,
        moduleId: mod.id,
        moduleRootPath: mod.rootPath,
        capabilityProfile: mod.capabilityProfile as any,
      });

      const execution = await workflowService.resumeWorkflowExecution(
        req.tenantContext,
        moduleCtx,
        req.params.id,
        stepExecutionId,
        outcome,
      );
      res.json(execution);
    } catch (err) {
      if (err instanceof CapabilityDeniedError) {
        return res.status(403).json({ message: err.message, capability: err.capability });
      }
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-executions/:id/steps", async (req, res) => {
    try {
      const steps = await workflowService.getWorkflowExecutionSteps(req.tenantContext, req.params.id);
      res.json(steps);
    } catch (err) {
      if (err instanceof WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-triggers", async (req, res) => {
    try {
      const triggers = await triggerService.getTriggersByTenant(req.tenantContext);
      res.json(triggers);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-triggers/:id", async (req, res) => {
    try {
      const trigger = await triggerService.getTrigger(req.tenantContext, req.params.id);
      if (!trigger) return res.status(404).json({ message: "Trigger not found" });
      res.json(trigger);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers", async (req, res) => {
    try {
      const parsed = insertWorkflowTriggerSchema.omit({ tenantId: true }).parse(req.body);
      const trigger = await triggerService.createTrigger(req.tenantContext, parsed);
      res.status(201).json(trigger);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers/:id/disable", async (req, res) => {
    try {
      const trigger = await triggerService.disableTrigger(req.tenantContext, req.params.id);
      res.json(trigger);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers/:id/enable", async (req, res) => {
    try {
      const trigger = await triggerService.enableTrigger(req.tenantContext, req.params.id);
      res.json(trigger);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers/:id/fire", async (req, res) => {
    try {
      const intent = await triggerService.fireManualTrigger(
        req.tenantContext,
        req.params.id,
        req.body.payload || {},
      );
      res.status(201).json(intent);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions/:id/triggers", async (req, res) => {
    try {
      const triggers = await triggerService.getTriggersByDefinition(
        req.tenantContext,
        req.params.id,
      );
      res.json(triggers);
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/record-events", async (req, res) => {
    try {
      const { event, recordType, recordData } = req.body;
      if (!event || !recordType) {
        return res.status(400).json({ message: "event and recordType are required" });
      }
      const intents = await triggerService.emitRecordEvent(
        req.tenantContext,
        event,
        recordType,
        recordData || {},
      );
      res.status(201).json({ matched: intents.length, intents });
    } catch (err) {
      if (err instanceof TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-intents", async (req, res) => {
    const intents = await storage.getWorkflowExecutionIntentsByTenant(req.tenantContext.tenantId);
    res.json(intents);
  });

  app.get("/api/workflow-intents/:id", async (req, res) => {
    const intent = await storage.getWorkflowExecutionIntent(req.params.id);
    if (!intent) return res.status(404).json({ message: "Intent not found" });
    if (intent.tenantId !== req.tenantContext.tenantId) {
      return res.status(403).json({ message: "Intent does not belong to this tenant" });
    }
    res.json(intent);
  });

  app.post("/api/workflow-intents/dispatch", async (req, res) => {
    try {
      const dispatched = await dispatchPendingIntents();
      res.json({ dispatched: dispatched.length, intents: dispatched });
    } catch (err) {
      throw err;
    }
  });

  startScheduler();

  return httpServer;
}
