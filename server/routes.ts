import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChangeRecordSchema, insertAgentRunSchema, insertModuleOverrideSchema, insertWorkflowDefinitionSchema, insertWorkflowStepSchema } from "@shared/schema";
import { tenantResolution } from "./middleware/tenant";
import { getTenantStorage } from "./tenantStorage";
import { buildModuleExecutionContext } from "./moduleContext";
import { ModuleBoundaryViolationError } from "./moduleContext";
import { CapabilityDeniedError } from "./capabilities";
import type { CapabilityProfileName } from "./capabilityProfiles";
import { PlatformContexts } from "./platformContext";
import { ec3l } from "./ec3l";
import { insertWorkflowTriggerSchema, insertRecordTypeSchema, insertFieldDefinitionSchema, insertChoiceListSchema, insertChoiceItemSchema, insertFormDefinitionSchema, insertFormSectionSchema, insertFormFieldPlacementSchema, insertFormBehaviorRuleSchema } from "@shared/schema";
import { insertRbacRoleSchema, insertRbacPolicySchema } from "@shared/schema";
import { insertChangeTargetSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await ec3l.rbac.seedPermissions();

  app.get("/api/tenants", async (_req, res) => {
    const tenantList = await storage.getTenants();
    res.json(tenantList);
  });

  app.use("/api", tenantResolution);

  // Projects — tenant-scoped via service layer
  app.get("/api/projects", async (req, res) => {
    const result = await ec3l.project.getProjects(req.tenantContext);
    res.json(result);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await ec3l.project.getProject(req.tenantContext, req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const project = await ec3l.project.createProject(req.tenantContext, parsed.data);
    res.status(201).json(project);
  });

  app.get("/api/projects/:id/changes", async (req, res) => {
    const changes = await ec3l.change.getChangesByProject(req.tenantContext, req.params.id);
    res.json(changes);
  });

  app.get("/api/projects/:id/modules", async (req, res) => {
    const mods = await ec3l.module.getModulesByProject(req.tenantContext, req.params.id);
    res.json(mods);
  });

  app.get("/api/projects/:id/environments", async (req, res) => {
    const envs = await ec3l.environment.getEnvironmentsByProject(req.tenantContext, req.params.id);
    res.json(envs);
  });

  // Changes
  app.get("/api/changes", async (req, res) => {
    const changes = await ec3l.change.getChanges(req.tenantContext);
    res.json(changes);
  });

  app.get("/api/changes/:id", async (req, res) => {
    const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });
    res.json(change);
  });

  app.post("/api/changes", async (req, res) => {
    const parsed = insertChangeRecordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    try {
      const change = await ec3l.change.createChange(req.tenantContext, parsed.data);
      res.status(201).json(change);
    } catch (err) {
      if (err instanceof ec3l.change.ChangeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/changes/:id/status", async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: "status is required" });
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      if (status === "Ready" || status === "Merged") {
        ec3l.agentGuard.assertNotAgent(actor, "approve changes");
        await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.CHANGE_APPROVE, "change", req.params.id);
      }
      const updated = await ec3l.change.updateChangeStatus(req.tenantContext, req.params.id, status);
      if (!updated) return res.status(404).json({ message: "Change not found" });
      res.json(updated);
    } catch (err: any) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof ec3l.change.ChangeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err.message?.startsWith("Missing actor identity") || err.message?.startsWith("Missing user identity")) {
        return res.status(401).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/changes/:id/project", async (req, res) => {
    const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });
    const project = await ec3l.project.getProject(req.tenantContext, change.projectId);
    res.json(project || null);
  });

  app.get("/api/changes/:id/workspace", async (req, res) => {
    const workspace = await ec3l.workspace.getWorkspaceByChange(req.tenantContext, req.params.id);
    res.json(workspace || null);
  });

  app.get("/api/changes/:id/agent-runs", async (req, res) => {
    const runs = await ec3l.agentRun.getAgentRunsByChange(req.tenantContext, req.params.id);
    res.json(runs);
  });

  // Change Targets
  app.post("/api/changes/:id/targets", async (req, res) => {
    try {
      const parsed = insertChangeTargetSchema
        .omit({ projectId: true, changeId: true })
        .parse(req.body);
      const target = await ec3l.changeTarget.createChangeTarget(
        req.tenantContext,
        req.params.id,
        parsed,
      );
      res.status(201).json(target);
    } catch (err) {
      if (err instanceof ec3l.changeTarget.ChangeTargetServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof Error && err.name === "ZodError") {
        return res.status(400).json({ message: "Invalid change target data", errors: err });
      }
      throw err;
    }
  });

  app.get("/api/changes/:id/targets", async (req, res) => {
    try {
      const targets = await ec3l.changeTarget.listChangeTargets(
        req.tenantContext,
        req.params.id,
      );
      res.json(targets);
    } catch (err) {
      if (err instanceof ec3l.changeTarget.ChangeTargetServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  // Change Patch Operations
  app.post("/api/changes/:id/patch-ops", async (req, res) => {
    try {
      const { targetId, opType, payload } = req.body;
      if (!targetId) return res.status(400).json({ message: "targetId is required" });
      if (!opType) return res.status(400).json({ message: "opType is required" });
      if (payload === undefined || payload === null) {
        return res.status(400).json({ message: "payload is required" });
      }
      const op = await ec3l.patchOp.createPatchOp(
        req.tenantContext,
        req.params.id,
        targetId,
        opType,
        payload,
      );
      res.status(201).json(op);
    } catch (err) {
      if (err instanceof ec3l.patchOp.PatchOpServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.delete("/api/changes/:id/patch-ops/:opId", async (req, res) => {
    try {
      await ec3l.patchOp.deletePatchOp(
        req.tenantContext,
        req.params.id,
        req.params.opId,
      );
      res.status(204).send();
    } catch (err) {
      if (err instanceof ec3l.patchOp.PatchOpServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/changes/:id/patch-ops", async (req, res) => {
    try {
      const ops = await ec3l.patchOp.listPatchOps(
        req.tenantContext,
        req.params.id,
      );
      res.json(ops);
    } catch (err) {
      if (err instanceof ec3l.patchOp.PatchOpServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  // Execute patch operations for a change
  app.post("/api/changes/:id/execute", async (req, res) => {
    try {
      const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
      if (!change) return res.status(404).json({ message: "Change not found" });

      const result = await ec3l.patchOpExecutor.executePatchOps(req.tenantContext, req.params.id);
      if (!result.success) {
        return res.status(422).json({ message: result.error, ...result });
      }
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.patchOpExecutor.PatchOpExecutionError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.change.ChangeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  // Start workspace — control plane delegates to runner service
  app.post("/api/changes/:id/start-workspace", async (req, res) => {
    const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
    if (!change) return res.status(404).json({ message: "Change not found" });

    if (change.status === "ValidationFailed") {
      return res.status(403).json({
        message: "Cannot start workspace on change — module boundary violation detected. A new Change is required.",
        failureReason: "MODULE_BOUNDARY_VIOLATION",
      });
    }

    let mod = null;
    if (change.moduleId) {
      mod = await getTenantStorage(req.tenantContext).getModule(change.moduleId);
    }

    const moduleCtx = buildModuleExecutionContext({
      tenantContext: req.tenantContext,
      moduleId: change.moduleId ?? "",
      moduleRootPath: mod?.rootPath ?? "",
      capabilityProfile: (mod?.capabilityProfile as CapabilityProfileName) ?? "CODE_MODULE_DEFAULT",
    });

    const updated = await ec3l.workspace.startWorkspace(req.tenantContext, change, moduleCtx);
    res.status(201).json(updated);
  });

  // Check in
  app.post("/api/changes/:id/checkin", async (req, res) => {
    try {
      await ec3l.rbac.authorize(req.tenantContext, ec3l.rbac.actorFromContext(req.tenantContext), ec3l.rbac.PERMISSIONS.CHANGE_APPROVE, "change", req.params.id);
      const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
      if (!change) return res.status(404).json({ message: "Change not found" });

      if (change.status === "ValidationFailed") {
        return res.status(403).json({
          message: "Cannot promote change — module boundary violation detected. A new Change is required.",
          failureReason: "MODULE_BOUNDARY_VIOLATION",
        });
      }

      await ec3l.change.updateChangeStatus(req.tenantContext, change.id, "Ready");
      const updated = await ec3l.change.getChange(req.tenantContext, change.id);
      res.json(updated);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      throw err;
    }
  });

  // Merge
  app.post("/api/changes/:id/merge", async (req, res) => {
    try {
      await ec3l.rbac.authorize(req.tenantContext, ec3l.rbac.actorFromContext(req.tenantContext), ec3l.rbac.PERMISSIONS.CHANGE_APPROVE, "change", req.params.id);
      const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
      if (!change) return res.status(404).json({ message: "Change not found" });

      if (change.status === "ValidationFailed") {
        return res.status(403).json({
          message: "Cannot merge change — module boundary violation detected. A new Change is required.",
          failureReason: "MODULE_BOUNDARY_VIOLATION",
        });
      }

      await ec3l.change.updateChangeStatus(req.tenantContext, change.id, "Merged");
      const workspace = await ec3l.workspace.getWorkspaceByChange(req.tenantContext, change.id);
      if (workspace) {
        await ec3l.workspace.stopWorkspace(req.tenantContext, workspace.id);
      }
      const updated = await ec3l.change.getChange(req.tenantContext, change.id);
      res.json(updated);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof ec3l.change.ChangeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  // Agent run — with module-scoped permissions
  app.post("/api/changes/:id/agent-run", async (req, res) => {
    const change = await ec3l.change.getChange(req.tenantContext, req.params.id);
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
      mod = await getTenantStorage(req.tenantContext).getModule(change.moduleId);
    }

    const moduleCtx = buildModuleExecutionContext({
      tenantContext: req.tenantContext,
      moduleId: change.moduleId ?? "",
      moduleRootPath: mod?.rootPath ?? "",
      capabilityProfile: (mod?.capabilityProfile as CapabilityProfileName) ?? "CODE_MODULE_DEFAULT",
    });

    try {
      const run = await ec3l.agentRun.createAgentRun(req.tenantContext, parsed.data, change, moduleCtx);
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
    const runs = await ec3l.agentRun.getAgentRuns(req.tenantContext);
    res.json(runs);
  });

  // Modules
  app.get("/api/modules", async (req, res) => {
    const mods = await ec3l.module.getModules(req.tenantContext);
    res.json(mods);
  });

  // Environments
  app.get("/api/environments/:id", async (req, res) => {
    const env = await ec3l.environment.getEnvironment(req.tenantContext, req.params.id);
    if (!env) return res.status(404).json({ message: "Environment not found" });
    res.json(env);
  });

  // Environment Release Snapshot
  app.post("/api/environments/:id/release", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(
        req.tenantContext,
        actor,
        ec3l.rbac.PERMISSIONS.ENVIRONMENT_RELEASE_CREATE,
      );
      const release = await ec3l.environment.createReleaseSnapshot(
        req.tenantContext,
        req.params.id,
        actor,
      );
      res.status(201).json(release);
    } catch (err: any) {
      if (err instanceof ec3l.environment.ReleaseServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (
        err.message?.startsWith("Missing actor identity") ||
        err.message?.startsWith("Missing user identity")
      ) {
        return res.status(401).json({ message: err.message });
      }
      throw err;
    }
  });

  // Templates (read-only, system context)
  app.get("/api/templates", async (_req, res) => {
    const temps = await ec3l.template.systemGetTemplates(PlatformContexts.templateRead());
    res.json(temps);
  });

  app.get("/api/templates/:id", async (req, res) => {
    const template = await ec3l.template.systemGetTemplate(PlatformContexts.templateRead(), req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  });

  app.get("/api/templates/:id/modules", async (req, res) => {
    const tms = await ec3l.template.systemGetTemplateModules(PlatformContexts.templateRead(), req.params.id);
    res.json(tms);
  });

  app.post("/api/templates/:id/install", async (req, res) => {
    try {
      const installed = await ec3l.install.installTemplateIntoTenant(
        PlatformContexts.templateInstall(),
        req.tenantContext.tenantId,
        req.params.id,
      );
      res.status(201).json(installed);
    } catch (err) {
      if (err instanceof ec3l.install.InstallServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/installed-apps", async (req, res) => {
    const apps = await ec3l.install.getInstalledApps(
      PlatformContexts.installedAppsRead(),
      req.tenantContext.tenantId,
    );
    res.json(apps);
  });

  // Module Overrides — tenant-scoped
  app.get("/api/overrides", async (req, res) => {
    const overrides = await ec3l.override.getOverridesByTenant(req.tenantContext);
    res.json(overrides);
  });

  app.get("/api/overrides/:id", async (req, res) => {
    try {
      const override = await ec3l.override.getOverride(req.tenantContext, req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (err) {
      if (err instanceof ec3l.override.OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/overrides", async (req, res) => {
    const parsed = insertModuleOverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    try {
      const override = await ec3l.override.createOverride(req.tenantContext, {
        ...parsed.data,
        tenantId: req.tenantContext.tenantId,
      });
      res.status(201).json(override);
    } catch (err) {
      if (err instanceof ec3l.override.OverridePatchValidationError) {
        return res.status(err.statusCode).json({ message: err.message, violations: err.violations });
      }
      if (err instanceof ec3l.override.OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/overrides/:id/activate", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "activate overrides");
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.OVERRIDE_ACTIVATE, "override", req.params.id);
      const override = await ec3l.override.activateOverride(req.tenantContext, req.params.id);
      res.json(override);
    } catch (err) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof ec3l.override.OverridePatchValidationError) {
        return res.status(err.statusCode).json({ message: err.message, violations: err.violations });
      }
      if (err instanceof ec3l.override.OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/overrides/:id/retire", async (req, res) => {
    try {
      const override = await ec3l.override.retireOverride(req.tenantContext, req.params.id);
      res.json(override);
    } catch (err) {
      if (err instanceof ec3l.override.OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/installed-modules/:id/overrides", async (req, res) => {
    try {
      const overrides = await ec3l.override.getOverridesByInstalledModule(
        req.tenantContext,
        req.params.id,
      );
      res.json(overrides);
    } catch (err) {
      if (err instanceof ec3l.override.OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/installed-modules/:id/resolve", async (req, res) => {
    try {
      const resolved = await ec3l.override.resolveModuleConfig(
        req.tenantContext,
        req.params.id,
      );
      res.json(resolved);
    } catch (err) {
      if (err instanceof ec3l.override.OverrideServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions", async (req, res) => {
    try {
      const defs = await ec3l.workflow.getWorkflowDefinitions(req.tenantContext);
      res.json(defs);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions/:id", async (req, res) => {
    try {
      const def = await ec3l.workflow.getWorkflowDefinition(req.tenantContext, req.params.id);
      if (!def) return res.status(404).json({ message: "Workflow definition not found" });
      res.json(def);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
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
      const parsed = insertWorkflowDefinitionSchema.parse(data);
      const def = await ec3l.workflow.createWorkflowDefinition(
        req.tenantContext,
        parsed,
        projectId,
        moduleId,
      );
      res.status(201).json(def);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/activate", async (req, res) => {
    try {
      const def = await ec3l.workflow.activateWorkflowDefinition(req.tenantContext, req.params.id);
      res.json(def);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/retire", async (req, res) => {
    try {
      const def = await ec3l.workflow.retireWorkflowDefinition(req.tenantContext, req.params.id);
      res.json(def);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions/:id/steps", async (req, res) => {
    try {
      const steps = await ec3l.workflow.getWorkflowSteps(req.tenantContext, req.params.id);
      res.json(steps);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/steps", async (req, res) => {
    try {
      const parsed = insertWorkflowStepSchema.omit({ workflowDefinitionId: true }).parse(req.body);
      const step = await ec3l.workflow.addWorkflowStep(
        req.tenantContext,
        req.params.id,
        parsed,
      );
      res.status(201).json(step);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-definitions/:id/execute", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "execute workflows");
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.WORKFLOW_EXECUTE, "workflow", req.params.id);
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

      const execution = await ec3l.workflow.executeWorkflow(
        req.tenantContext,
        moduleCtx,
        req.params.id,
        input || {},
      );
      res.status(201).json(execution);
    } catch (err) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof CapabilityDeniedError) {
        return res.status(403).json({ message: err.message, capability: err.capability });
      }
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-executions", async (req, res) => {
    try {
      const execs = await ec3l.workflow.getWorkflowExecutions(req.tenantContext);
      res.json(execs);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-executions/:id", async (req, res) => {
    try {
      const exec = await ec3l.workflow.getWorkflowExecution(req.tenantContext, req.params.id);
      if (!exec) return res.status(404).json({ message: "Workflow execution not found" });
      res.json(exec);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-executions/:id/resume", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "approve or resume workflow executions");
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.WORKFLOW_APPROVE, "workflow", req.params.id);
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

      const execution = await ec3l.workflow.resumeWorkflowExecution(
        req.tenantContext,
        moduleCtx,
        req.params.id,
        stepExecutionId,
        outcome,
      );
      res.json(execution);
    } catch (err) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof CapabilityDeniedError) {
        return res.status(403).json({ message: err.message, capability: err.capability });
      }
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-executions/:id/steps", async (req, res) => {
    try {
      const steps = await ec3l.workflow.getWorkflowExecutionSteps(req.tenantContext, req.params.id);
      res.json(steps);
    } catch (err) {
      if (err instanceof ec3l.workflow.WorkflowServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-triggers", async (req, res) => {
    try {
      const triggers = await ec3l.trigger.getTriggersByTenant(req.tenantContext);
      res.json(triggers);
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-triggers/:id", async (req, res) => {
    try {
      const trigger = await ec3l.trigger.getTrigger(req.tenantContext, req.params.id);
      if (!trigger) return res.status(404).json({ message: "Trigger not found" });
      res.json(trigger);
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers", async (req, res) => {
    try {
      const parsed = insertWorkflowTriggerSchema.parse(req.body);
      const trigger = await ec3l.trigger.createTrigger(req.tenantContext, parsed);
      res.status(201).json(trigger);
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers/:id/disable", async (req, res) => {
    try {
      const trigger = await ec3l.trigger.disableTrigger(req.tenantContext, req.params.id);
      res.json(trigger);
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers/:id/enable", async (req, res) => {
    try {
      const trigger = await ec3l.trigger.enableTrigger(req.tenantContext, req.params.id);
      res.json(trigger);
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/workflow-triggers/:id/fire", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "fire workflow triggers");
      const intent = await ec3l.trigger.fireManualTrigger(
        req.tenantContext,
        req.params.id,
        req.body.payload || {},
      );
      res.status(201).json(intent);
    } catch (err) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.trigger.TriggerServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/workflow-definitions/:id/triggers", async (req, res) => {
    try {
      const triggers = await ec3l.trigger.getTriggersByDefinition(
        req.tenantContext,
        req.params.id,
      );
      res.json(triggers);
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
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
      const intents = await ec3l.trigger.emitRecordEvent(
        req.tenantContext,
        event,
        recordType,
        recordData || {},
      );
      res.status(201).json({ matched: intents.length, intents });
    } catch (err) {
      if (err instanceof ec3l.trigger.TriggerServiceError) {
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
      const dispatched = await ec3l.intentDispatcher.dispatchPendingIntents();
      res.json({ dispatched: dispatched.length, intents: dispatched });
    } catch (err) {
      throw err;
    }
  });

  // --- Record Types ---
  app.get("/api/record-types", async (req, res) => {
    try {
      const types = await ec3l.recordType.listRecordTypes(req.tenantContext);
      res.json(types);
    } catch (err) {
      if (err instanceof ec3l.recordType.RecordTypeServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/record-types/by-key/:key", async (req, res) => {
    try {
      const rt = await ec3l.recordType.getRecordType(req.tenantContext, req.params.key);
      if (!rt) return res.status(404).json({ message: "Record type not found" });
      res.json(rt);
    } catch (err) {
      if (err instanceof ec3l.recordType.RecordTypeServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/record-types/:id", async (req, res) => {
    try {
      const rt = await ec3l.form.getRecordType(req.tenantContext, req.params.id);
      if (!rt) return res.status(404).json({ message: "Record type not found" });
      res.json(rt);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/record-types", async (req, res) => {
    try {
      if (!req.body.projectId) {
        return res.status(400).json({ message: "projectId is required" });
      }
      if (req.body.key) {
        const rt = await ec3l.recordType.createRecordType(req.tenantContext, req.body);
        return res.status(201).json(rt);
      }
      const parsed = insertRecordTypeSchema.parse(req.body);
      const rt = await ec3l.form.createRecordType(req.tenantContext, parsed);
      res.status(201).json(rt);
    } catch (err) {
      if (err instanceof ec3l.recordType.RecordTypeServiceError) return res.status(err.statusCode).json({ message: err.message });
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      if (err instanceof Error && err.name === "ZodError") {
        return res.status(400).json({ message: "Invalid record type data", errors: err });
      }
      throw err;
    }
  });

  app.post("/api/record-types/:id/activate", async (req, res) => {
    try {
      const rt = await ec3l.form.updateRecordTypeStatus(req.tenantContext, req.params.id, "active");
      res.json(rt);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/record-types/:id/retire", async (req, res) => {
    try {
      const rt = await ec3l.form.updateRecordTypeStatus(req.tenantContext, req.params.id, "retired");
      res.json(rt);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Field Definitions ---
  app.get("/api/record-types/:id/fields", async (req, res) => {
    try {
      const fields = await ec3l.form.getFieldDefinitionsByRecordType(req.tenantContext, req.params.id);
      res.json(fields);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/record-types/:id/fields", async (req, res) => {
    try {
      const parsed = insertFieldDefinitionSchema.omit({ recordTypeId: true }).parse(req.body);
      const field = await ec3l.form.createFieldDefinition(req.tenantContext, {
        ...parsed,
        recordTypeId: req.params.id,
      });
      res.status(201).json(field);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Choice Lists ---
  app.get("/api/choice-lists", async (req, res) => {
    try {
      const lists = await ec3l.form.getChoiceListsByTenant(req.tenantContext);
      res.json(lists);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/choice-lists/:id", async (req, res) => {
    try {
      const cl = await ec3l.form.getChoiceList(req.tenantContext, req.params.id);
      if (!cl) return res.status(404).json({ message: "Choice list not found" });
      res.json(cl);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/choice-lists", async (req, res) => {
    try {
      const parsed = insertChoiceListSchema.parse(req.body);
      const cl = await ec3l.form.createChoiceList(req.tenantContext, parsed);
      res.status(201).json(cl);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Choice Items ---
  app.get("/api/choice-lists/:id/items", async (req, res) => {
    try {
      const items = await ec3l.form.getChoiceItemsByList(req.tenantContext, req.params.id);
      res.json(items);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/choice-lists/:id/items", async (req, res) => {
    try {
      const parsed = insertChoiceItemSchema.omit({ choiceListId: true }).parse(req.body);
      const item = await ec3l.form.createChoiceItem(req.tenantContext, {
        ...parsed,
        choiceListId: req.params.id,
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Definitions ---
  app.get("/api/form-definitions", async (req, res) => {
    try {
      const defs = await ec3l.form.getFormDefinitionsByTenant(req.tenantContext);
      res.json(defs);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/form-definitions/:id", async (req, res) => {
    try {
      const fd = await ec3l.form.getFormDefinition(req.tenantContext, req.params.id);
      if (!fd) return res.status(404).json({ message: "Form definition not found" });
      res.json(fd);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/form-definitions", async (req, res) => {
    try {
      const parsed = insertFormDefinitionSchema.parse(req.body);
      const fd = await ec3l.form.createFormDefinition(req.tenantContext, parsed);
      res.status(201).json(fd);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/form-definitions/:id/activate", async (req, res) => {
    try {
      const fd = await ec3l.form.updateFormDefinitionStatus(req.tenantContext, req.params.id, "active");
      res.json(fd);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/form-definitions/:id/retire", async (req, res) => {
    try {
      const fd = await ec3l.form.updateFormDefinitionStatus(req.tenantContext, req.params.id, "retired");
      res.json(fd);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Sections ---
  app.get("/api/form-definitions/:id/sections", async (req, res) => {
    try {
      const sections = await ec3l.form.getFormSectionsByDefinition(req.tenantContext, req.params.id);
      res.json(sections);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/form-definitions/:id/sections", async (req, res) => {
    try {
      const parsed = insertFormSectionSchema.omit({ formDefinitionId: true }).parse(req.body);
      const section = await ec3l.form.createFormSection(req.tenantContext, {
        ...parsed,
        formDefinitionId: req.params.id,
      });
      res.status(201).json(section);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Field Placements ---
  app.get("/api/form-sections/:id/placements", async (req, res) => {
    try {
      const placements = await ec3l.form.getFormFieldPlacementsBySection(req.tenantContext, req.params.id);
      res.json(placements);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/form-sections/:id/placements", async (req, res) => {
    try {
      const parsed = insertFormFieldPlacementSchema.omit({ formSectionId: true }).parse(req.body);
      const placement = await ec3l.form.createFormFieldPlacement(req.tenantContext, {
        ...parsed,
        formSectionId: req.params.id,
      });
      res.status(201).json(placement);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Behavior Rules ---
  app.get("/api/form-definitions/:id/rules", async (req, res) => {
    try {
      const rules = await ec3l.form.getFormBehaviorRulesByDefinition(req.tenantContext, req.params.id);
      res.json(rules);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.post("/api/form-definitions/:id/rules", async (req, res) => {
    try {
      const parsed = insertFormBehaviorRuleSchema.omit({ formDefinitionId: true }).parse(req.body);
      const rule = await ec3l.form.createFormBehaviorRule(req.tenantContext, {
        ...parsed,
        formDefinitionId: req.params.id,
      });
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Compilation ---
  app.get("/api/forms/:recordTypeName/:formName/compiled", async (req, res) => {
    try {
      const compiled = await ec3l.form.compileForm(
        req.tenantContext,
        req.params.recordTypeName,
        req.params.formName,
      );
      res.json(compiled);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Studio: Save Override ---
  app.post("/api/forms/:recordTypeName/:formName/overrides", async (req, res) => {
    try {
      await ec3l.rbac.authorize(req.tenantContext, ec3l.rbac.actorFromContext(req.tenantContext), ec3l.rbac.PERMISSIONS.FORM_EDIT, "form");
      const { changeSummary, operations, projectId } = req.body;
      if (!changeSummary || typeof changeSummary !== "string") {
        return res.status(400).json({ message: "changeSummary is required" });
      }
      if (!operations || !Array.isArray(operations)) {
        return res.status(400).json({ message: "operations is required and must be an array of typed patch operations" });
      }

      let parsedOps;
      try {
        parsedOps = ec3l.form.parseAndValidateOperations({ operations });
      } catch (parseErr: unknown) {
        return res.status(400).json({ message: "Invalid patch operations", errors: parseErr instanceof Error ? parseErr.message : String(parseErr) });
      }

      const result = await ec3l.form.createFormOverrideDraft(
        req.tenantContext,
        req.params.recordTypeName,
        req.params.formName,
        changeSummary,
        parsedOps,
        projectId,
      );
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- Form Studio: Vibe Patch ---
  app.post("/api/forms/:recordTypeName/:formName/vibePatch", async (req, res) => {
    try {
      const { description } = req.body;
      if (!description || typeof description !== "string") {
        return res.status(400).json({ message: "description is required" });
      }

      const patchResult = await ec3l.form.generateVibePatch(
        req.tenantContext,
        req.params.recordTypeName,
        req.params.formName,
        description,
      );
      res.json(patchResult);
    } catch (err) {
      if (err instanceof ec3l.form.FormServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  // --- RBAC Routes ---

  async function requireRbacAdmin(req: import("express").Request, res: import("express").Response): Promise<boolean> {
    try {
      await ec3l.rbac.authorize(req.tenantContext, ec3l.rbac.actorFromContext(req.tenantContext), ec3l.rbac.PERMISSIONS.CHANGE_APPROVE);
      return true;
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        res.status(403).json({ message: "RBAC administration requires admin privileges", permission: err.permission });
        return false;
      }
      throw err;
    }
  }

  app.get("/api/rbac/permissions", async (_req, res) => {
    const perms = await storage.getRbacPermissions();
    res.json(perms);
  });

  app.get("/api/rbac/roles", async (req, res) => {
    const roles = await storage.getRbacRolesByTenant(req.tenantContext.tenantId);
    res.json(roles);
  });

  app.post("/api/rbac/roles", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    try {
      const parsed = insertRbacRoleSchema.parse(req.body);
      const role = await storage.createRbacRole({
        ...parsed,
        tenantId: req.tenantContext.tenantId,
      });
      res.status(201).json(role);
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        return res.status(400).json({ message: "Invalid role data", errors: err });
      }
      throw err;
    }
  });

  app.post("/api/rbac/roles/:id/disable", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const role = await storage.getRbacRole(req.params.id);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(404).json({ message: "Role not found" });
    }
    const updated = await storage.updateRbacRoleStatus(req.params.id, "disabled");
    res.json(updated);
  });

  app.post("/api/rbac/roles/:id/enable", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const role = await storage.getRbacRole(req.params.id);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(404).json({ message: "Role not found" });
    }
    const updated = await storage.updateRbacRoleStatus(req.params.id, "active");
    res.json(updated);
  });

  app.get("/api/rbac/roles/:id/permissions", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const role = await storage.getRbacRole(req.params.id);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(404).json({ message: "Role not found" });
    }
    const rolePerms = await storage.getRbacRolePermissions(req.params.id);
    const allPerms = await storage.getRbacPermissions();
    const permMap = new Map(allPerms.map(p => [p.id, p]));
    const result = rolePerms.map(rp => permMap.get(rp.permissionId)).filter(Boolean);
    res.json(result);
  });

  app.post("/api/rbac/roles/:id/permissions", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const { permissionId } = req.body;
    if (!permissionId) return res.status(400).json({ message: "permissionId is required" });
    const role = await storage.getRbacRole(req.params.id);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(404).json({ message: "Role not found" });
    }
    await storage.addRbacRolePermission(req.params.id, permissionId);
    res.status(201).json({ message: "Permission added" });
  });

  app.delete("/api/rbac/roles/:id/permissions/:permissionId", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const role = await storage.getRbacRole(req.params.id);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(404).json({ message: "Role not found" });
    }
    await storage.removeRbacRolePermission(req.params.id, req.params.permissionId);
    res.json({ message: "Permission removed" });
  });

  app.get("/api/rbac/users/:userId/roles", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const roles = await storage.getRbacUserRolesByTenant(req.params.userId, req.tenantContext.tenantId);
    res.json(roles);
  });

  app.post("/api/rbac/users/:userId/roles", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const { roleId } = req.body;
    if (!roleId) return res.status(400).json({ message: "roleId is required" });
    const role = await storage.getRbacRole(roleId);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(400).json({ message: "Role not found or belongs to a different tenant" });
    }
    await storage.addRbacUserRole(req.params.userId, roleId);
    res.status(201).json({ message: "Role assigned" });
  });

  app.delete("/api/rbac/users/:userId/roles/:roleId", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const role = await storage.getRbacRole(req.params.roleId);
    if (!role || role.tenantId !== req.tenantContext.tenantId) {
      return res.status(404).json({ message: "Role not found" });
    }
    await storage.removeRbacUserRole(req.params.userId, req.params.roleId);
    res.json({ message: "Role removed" });
  });

  app.get("/api/rbac/policies", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const policies = await storage.getRbacPoliciesByTenant(req.tenantContext.tenantId);
    res.json(policies);
  });

  app.post("/api/rbac/policies", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    try {
      const parsed = insertRbacPolicySchema.parse(req.body);
      const role = await storage.getRbacRole(parsed.roleId);
      if (!role || role.tenantId !== req.tenantContext.tenantId) {
        return res.status(400).json({ message: "Role not found or belongs to a different tenant" });
      }
      const policy = await storage.createRbacPolicy({
        ...parsed,
        tenantId: req.tenantContext.tenantId,
      });
      res.status(201).json(policy);
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        return res.status(400).json({ message: "Invalid policy data", errors: err });
      }
      throw err;
    }
  });

  app.delete("/api/rbac/policies/:id", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const policies = await storage.getRbacPoliciesByTenant(req.tenantContext.tenantId);
    const target = policies.find(p => p.id === req.params.id);
    if (!target) return res.status(404).json({ message: "Policy not found" });
    await storage.deleteRbacPolicy(req.params.id);
    res.json({ message: "Policy deleted" });
  });

  app.post("/api/rbac/seed-defaults", async (req, res) => {
    const existingRoles = await storage.getRbacRolesByTenant(req.tenantContext.tenantId);
    if (existingRoles.length > 0) {
      if (!(await requireRbacAdmin(req, res))) return;
    }
    await ec3l.rbac.seedDefaultRoles(req.tenantContext.tenantId);
    const roles = await storage.getRbacRolesByTenant(req.tenantContext.tenantId);
    res.json({ message: "Default roles seeded", roles });
  });

  app.get("/api/rbac/audit-logs", async (req, res) => {
    if (!(await requireRbacAdmin(req, res))) return;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const logs = await storage.getRbacAuditLogs(req.tenantContext.tenantId, limit);
    res.json(logs);
  });

  // --- HR Lite ---

  app.post("/api/hr-lite/install", async (req, res) => {
    try {
      const result = await ec3l.hrLite.installHrLite(req.tenantContext);
      res.json({
        message: "HR Lite installed successfully",
        module: result.module,
        recordTypes: {
          employee: {
            id: result.recordTypes.employee.id,
            name: result.recordTypes.employee.name,
            fieldCount: result.fields.employee.length,
          },
          jobChange: {
            id: result.recordTypes.jobChange.id,
            name: result.recordTypes.jobChange.name,
            fieldCount: result.fields.jobChange.length,
          },
        },
        choiceLists: {
          employeeStatus: result.choiceLists.employeeStatus.id,
          changeType: result.choiceLists.changeType.id,
          jobChangeStatus: result.choiceLists.jobChangeStatus.id,
        },
        forms: {
          employeeDefault: result.forms.employeeDefault,
          jobChangeDefault: result.forms.jobChangeDefault,
        },
        rbac: result.rbac,
        workflows: result.workflows,
      });
    } catch (err) {
      if (err instanceof ec3l.hrLite.HrLiteInstallError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/record-locks", async (req, res) => {
    const locks = await ec3l.form.getRecordLocksByTenant(req.tenantContext);
    res.json(locks);
  });

  app.get("/api/record-locks/check", async (req, res) => {
    const { recordTypeId, recordId } = req.query;
    if (!recordTypeId || !recordId) {
      return res.status(400).json({ message: "recordTypeId and recordId are required" });
    }
    const locked = await ec3l.form.isRecordLocked(
      req.tenantContext,
      recordTypeId as string,
      recordId as string,
    );
    res.json({ locked });
  });

  // --- Agent Proposal Routes ---

  app.get("/api/agent-proposals", async (req, res) => {
    try {
      const { changeId } = req.query;
      if (changeId) {
        const proposals = await ec3l.agentProposal.getProposalsByChange(
          req.tenantContext,
          changeId as string,
        );
        return res.json(proposals);
      }
      const proposals = await ec3l.agentProposal.getProposalsByTenant(req.tenantContext);
      res.json(proposals);
    } catch (err) {
      if (err instanceof ec3l.agentProposal.AgentProposalError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/agent-proposals/:id", async (req, res) => {
    try {
      const proposal = await ec3l.agentProposal.getProposal(
        req.tenantContext,
        req.params.id,
      );
      if (!proposal) return res.status(404).json({ message: "Proposal not found" });
      if (proposal.tenantId !== req.tenantContext.tenantId) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      res.json(proposal);
    } catch (err) {
      if (err instanceof ec3l.agentProposal.AgentProposalError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/agent-proposals", async (req, res) => {
    try {
      const { agentId, proposalType, targetRef, payload, summary, changeId, projectId } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId is required" });
      if (!proposalType) return res.status(400).json({ message: "proposalType is required" });
      if (!targetRef) return res.status(400).json({ message: "targetRef is required" });
      if (!payload) return res.status(400).json({ message: "payload is required" });

      const proposal = await ec3l.agentProposal.createProposal(
        req.tenantContext,
        { agentId, proposalType, targetRef, payload, summary, changeId, projectId },
      );
      res.status(201).json(proposal);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof ec3l.agentProposal.AgentProposalError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/agent-proposals/:id/submit", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "submit proposals for activation");
      const proposal = await ec3l.agentProposal.submitProposal(
        req.tenantContext,
        req.params.id,
        actor,
      );
      res.json(proposal);
    } catch (err) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.agentProposal.AgentProposalError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/agent-proposals/:id/review", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "review proposals");
      const { decision } = req.body;
      if (!decision || !["accepted", "rejected"].includes(decision)) {
        return res.status(400).json({ message: "decision must be 'accepted' or 'rejected'" });
      }
      const proposal = await ec3l.agentProposal.reviewProposal(
        req.tenantContext,
        req.params.id,
        decision,
        actor,
      );
      res.json(proposal);
    } catch (err) {
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message, action: err.action });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message, permission: err.permission });
      }
      if (err instanceof ec3l.agentProposal.AgentProposalError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/changes", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const tenantId = req.tenantContext.tenantId;

      const projects = await storage.getProjectsByTenant(tenantId);
      const projectIds = new Set(projects.map((p) => p.id));
      const projectMap = new Map(projects.map((p) => [p.id, p.name]));

      const allChanges = await storage.getChanges();
      const tenantChanges = allChanges.filter((c) => projectIds.has(c.projectId));

      const statusFilter = req.query.status as string | undefined;
      const fromDate = req.query.from as string | undefined;
      const toDate = req.query.to as string | undefined;

      let filtered = tenantChanges;
      if (statusFilter) {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
      if (fromDate) {
        const from = new Date(fromDate);
        if (!isNaN(from.getTime())) {
          filtered = filtered.filter((c) => new Date(c.createdAt) >= from);
        }
      }
      if (toDate) {
        const to = new Date(toDate);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          filtered = filtered.filter((c) => new Date(c.createdAt) <= to);
        }
      }

      const results = await Promise.all(
        filtered.map(async (c) => {
          const agentRuns = await storage.getAgentRunsByChange(c.id);
          const lastRun = agentRuns.length > 0 ? agentRuns[agentRuns.length - 1] : null;
          return {
            changeId: c.id,
            title: c.title,
            summary: c.description || c.title,
            status: c.status,
            projectName: projectMap.get(c.projectId) || c.projectId,
            actorType: lastRun ? "agent" : "user",
            actorId: lastRun?.id || null,
            createdAt: c.createdAt,
          };
        })
      );

      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(results);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/approvals", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const tenantId = req.tenantContext.tenantId;

      const executions = await storage.getWorkflowExecutionsByTenant(tenantId);
      const pausedExecutions = executions.filter((e) => e.status === "paused");
      const definitions = await storage.getWorkflowDefinitionsByTenant(tenantId);
      const defMap = new Map(definitions.map((d) => [d.id, d]));

      const approvals = [];
      for (const exec of pausedExecutions) {
        const stepExecs = await storage.getWorkflowStepExecutionsByExecution(exec.id);
        const awaitingSteps = stepExecs.filter((se) => se.status === "awaiting_approval");
        for (const stepExec of awaitingSteps) {
          const step = await storage.getWorkflowStep(stepExec.workflowStepId);
          const def = defMap.get(exec.workflowDefinitionId);
          const config = step?.config as Record<string, unknown> | undefined;
          const output = stepExec.output as Record<string, unknown> | undefined;
          const inputObj = exec.input && typeof exec.input === "object" ? (exec.input as Record<string, unknown>) : {};
          approvals.push({
            approvalId: stepExec.id,
            executionId: exec.id,
            workflowDefinitionId: exec.workflowDefinitionId,
            workflowName: def?.name || exec.workflowDefinitionId,
            stepType: step?.stepType || "approval",
            requiredRole: (config?.approver as string) || "pending",
            requestedBy: (inputObj.requester as string) || (inputObj.agentId as string) || "system",
            status: "awaiting_approval",
            createdAt: output?.createdAt || exec.startedAt,
          });
        }
      }
      res.json(approvals);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/workflows", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const definitions = await storage.getWorkflowDefinitionsByTenant(req.tenantContext.tenantId);
      res.json(definitions);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/workflow-executions", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const executions = await storage.getWorkflowExecutionsByTenant(req.tenantContext.tenantId);
      const definitions = await storage.getWorkflowDefinitionsByTenant(req.tenantContext.tenantId);
      const defMap = new Map(definitions.map((d) => [d.id, d.name]));
      const intents = await storage.getWorkflowExecutionIntentsByTenant(req.tenantContext.tenantId);
      const intentByExecId = new Map(intents.filter((i) => i.executionId).map((i) => [i.executionId, i]));
      const enriched = executions.map((ex) => {
        const intent = intentByExecId.get(ex.id);
        const inputObj = ex.input && typeof ex.input === "object" ? (ex.input as Record<string, unknown>) : {};
        return {
          id: ex.id,
          workflowName: defMap.get(ex.workflowDefinitionId) || ex.workflowDefinitionId,
          status: ex.status === "paused" ? "waiting" : ex.status,
          startedAt: ex.startedAt,
          completedAt: ex.completedAt,
          actorType: intent?.triggerType || "system",
          actorId: (inputObj.requester as string) || (inputObj.agentId as string) || null,
          error: ex.error,
        };
      });
      res.json(enriched);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/overrides", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const overrides = await storage.getModuleOverridesByTenant(req.tenantContext.tenantId);
      res.json(overrides);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/modules", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const tenantId = req.tenantContext.tenantId;
      const tenantProjects = await storage.getProjectsByTenant(tenantId);
      const allModules = [];
      for (const project of tenantProjects) {
        const mods = await storage.getModulesByProject(project.id);
        for (const m of mods) {
          allModules.push({
            id: m.id,
            name: m.name,
            type: m.type,
            version: m.version,
            status: "installed",
            installedAt: m.createdAt,
          });
        }
      }
      res.json(allModules);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/tenants", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const tenantList = await storage.getTenants();
      res.json(tenantList.map(t => ({
        ...t,
        status: t.plan || "active",
      })));
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/execution-telemetry", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const tenantId = req.tenantContext.tenantId;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const events = await storage.getExecutionTelemetryEvents(tenantId, { from, to, limit });
      res.json(events);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/check-access", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      res.json({ allowed: true });
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ allowed: false, message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/audit-feed", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const feed = await ec3l.auditFeed.getAuditFeed(req.tenantContext, { limit });
    res.json(feed);
  });

  ec3l.scheduler.startScheduler();

  return httpServer;
}
