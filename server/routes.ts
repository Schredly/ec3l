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
import type { GraphPackage } from "./graph/installGraphService";
import { DraftPatchOpError } from "./vibe/draftPatchOps";
import { generateAndPreviewWithRepair, generateAndPreviewWithRepairStreaming } from "./vibe/repairService";
import type { StreamStageEvent } from "./vibe/repairService";
import type { TokenStreamEvent } from "./vibe/tokenStreamService";
import { MultiStreamError } from "./vibe/tokenStreamService";
import { DraftVersionDiffError } from "./vibe/draftVersionDiffService";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await ec3l.rbac.seedPermissions();
  await ec3l.rbac.bootstrapRbacForAllTenants();

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
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const intents = await storage.getWorkflowExecutionIntentsByTenant(req.tenantContext.tenantId, limit);
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

  // Self-introspection — no admin permission required.
  // Returns only the calling user's own roles and permissions within the current tenant.
  app.get("/api/rbac/me", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      const actorId = actor.actorId;
      if (!actorId) {
        return res.status(401).json({ message: "Missing actor identity" });
      }
      const tenantId = req.tenantContext.tenantId;
      const userRoles = await storage.getRbacUserRolesByTenant(actorId, tenantId);
      const activeRoles = userRoles.filter(r => r.status === "active");

      const allPerms = await storage.getRbacPermissions();
      const permById = new Map(allPerms.map(p => [p.id, p.name]));

      const permissionKeys = new Set<string>();
      for (const role of activeRoles) {
        const rolePerms = await storage.getRbacRolePermissions(role.id);
        for (const rp of rolePerms) {
          const name = permById.get(rp.permissionId);
          if (name) permissionKeys.add(name);
        }
      }

      res.json({
        userId: actorId,
        roles: activeRoles.map(r => ({ id: r.id, name: r.name, status: r.status })),
        permissions: Array.from(permissionKeys),
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Missing actor identity")) {
        return res.status(401).json({ message: err.message });
      }
      throw err;
    }
  });

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

  // --- Graph Introspection (admin-only) ---

  app.get("/api/admin/graph/snapshot", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, full } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      if (full === "1") {
        const snapshot = await ec3l.graph.getProjectGraphSnapshot(req.tenantContext, projectId);
        return res.json(snapshot);
      }
      const summary = await ec3l.graph.getProjectGraphSummary(req.tenantContext, projectId);
      res.json(summary);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/graph/validate", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      const result = await ec3l.graph.validateProjectGraph(req.tenantContext, projectId);
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/graph/diff", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, changeId } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      if (!changeId || typeof changeId !== "string") {
        return res.status(400).json({ message: "changeId query parameter is required" });
      }
      const diff = await ec3l.graph.getChangeDiff(req.tenantContext, projectId, changeId);
      res.json(diff);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/graph/install", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      const preview = req.query.preview === "true";
      const allowDowngrade = req.query.allowDowngrade === "true";
      const graphPackage = req.body;
      if (!graphPackage || !Array.isArray(graphPackage.recordTypes)) {
        return res.status(400).json({ message: "Body must include recordTypes array" });
      }
      if (!graphPackage.packageKey || typeof graphPackage.packageKey !== "string") {
        return res.status(400).json({ message: "Body must include packageKey (string)" });
      }
      if (!graphPackage.version || typeof graphPackage.version !== "string") {
        return res.status(400).json({ message: "Body must include version (string)" });
      }
      const environmentId = typeof req.query.environmentId === "string" ? req.query.environmentId : undefined;
      const result = await ec3l.graph.installGraphPackage(
        req.tenantContext,
        projectId,
        graphPackage,
        { previewOnly: preview, allowDowngrade, environmentId },
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/graph/packages", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, packageKey } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      const history = await ec3l.graph.getPackageHistory(
        req.tenantContext,
        projectId,
        typeof packageKey === "string" ? packageKey : undefined,
      );
      res.json(history);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/graph/packages/diff", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, packageKey, fromVersion, toVersion } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      if (!packageKey || typeof packageKey !== "string") {
        return res.status(400).json({ message: "packageKey query parameter is required" });
      }
      if (!fromVersion || typeof fromVersion !== "string") {
        return res.status(400).json({ message: "fromVersion query parameter is required" });
      }
      if (!toVersion || typeof toVersion !== "string") {
        return res.status(400).json({ message: "toVersion query parameter is required" });
      }
      const diff = await ec3l.graph.getVersionDiff(
        req.tenantContext,
        projectId,
        packageKey,
        fromVersion,
        toVersion,
      );
      res.json(diff);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/graph/built-in", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      res.json(ec3l.graph.listBuiltInPackages());
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/graph/install-built-in", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, packageKey } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      if (!packageKey || typeof packageKey !== "string") {
        return res.status(400).json({ message: "packageKey query parameter is required" });
      }
      const preview = req.query.preview === "true";
      const builtIn = ec3l.graph.getBuiltInPackage(packageKey);
      if (!builtIn) {
        return res.status(404).json({
          message: `Built-in package "${packageKey}" not found`,
          available: ec3l.graph.listBuiltInPackages().map((p) => p.packageKey),
        });
      }
      const result = await ec3l.graph.installGraphPackages(
        req.tenantContext,
        projectId,
        [builtIn],
        { previewOnly: preview },
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  // --- Environment Package State & Promotion ---

  app.get("/api/admin/environments/:envId/packages", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const state = await ec3l.graph.getEnvironmentPackageState(
        req.tenantContext,
        req.params.envId,
      );
      res.json(state);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/admin/environments/diff", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { fromEnvId, toEnvId } = req.query;
      if (!fromEnvId || typeof fromEnvId !== "string") {
        return res.status(400).json({ message: "fromEnvId query parameter is required" });
      }
      if (!toEnvId || typeof toEnvId !== "string") {
        return res.status(400).json({ message: "toEnvId query parameter is required" });
      }
      const diff = await ec3l.graph.diffEnvironments(
        req.tenantContext,
        fromEnvId,
        toEnvId,
      );
      res.json(diff);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/environments/promote", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { fromEnvId, toEnvId, projectId } = req.query;
      // Gate check: if target environment requires approval, block direct promotion
      if (toEnvId && typeof toEnvId === "string") {
        const ts = getTenantStorage(req.tenantContext);
        const targetEnv = await ts.getEnvironment(toEnvId);
        if (targetEnv?.requiresPromotionApproval) {
          return res.status(403).json({
            message: "Target environment requires promotion approval. Use the promotion intent workflow instead.",
          });
        }
      }
      if (!fromEnvId || typeof fromEnvId !== "string") {
        return res.status(400).json({ message: "fromEnvId query parameter is required" });
      }
      if (!toEnvId || typeof toEnvId !== "string") {
        return res.status(400).json({ message: "toEnvId query parameter is required" });
      }
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId query parameter is required" });
      }
      const preview = req.query.preview === "true";
      const result = await ec3l.graph.promoteEnvironmentPackages(
        req.tenantContext,
        fromEnvId,
        toEnvId,
        projectId,
        { previewOnly: preview },
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  // --- Promotion Intents ---

  app.get("/api/admin/environments/promotions", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const intents = await ec3l.graph.listPromotionIntents(req.tenantContext, projectId);
      res.json(intents);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/environments/promotions", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, fromEnvironmentId, toEnvironmentId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!fromEnvironmentId) return res.status(400).json({ message: "fromEnvironmentId is required" });
      if (!toEnvironmentId) return res.status(400).json({ message: "toEnvironmentId is required" });
      const intent = await ec3l.graph.createPromotionIntent(req.tenantContext, {
        projectId,
        fromEnvironmentId,
        toEnvironmentId,
        createdBy: actor.actorId ?? undefined,
      });
      res.status(201).json(intent);
    } catch (err) {
      if (err instanceof ec3l.graph.PromotionIntentError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/environments/promotions/:id/preview", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const intent = await ec3l.graph.previewPromotionIntent(req.tenantContext, req.params.id);
      res.json(intent);
    } catch (err) {
      if (err instanceof ec3l.graph.PromotionIntentError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/environments/promotions/:id/approve", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      ec3l.agentGuard.assertNotAgent(actor, "approve promotion intents");
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ENVIRONMENT_PROMOTE);
      const intent = await ec3l.graph.approvePromotionIntent(
        req.tenantContext,
        req.params.id,
        actor.actorId!,
      );
      res.json(intent);
    } catch (err) {
      if (err instanceof ec3l.graph.PromotionIntentError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      if (err instanceof ec3l.agentGuard.AgentGuardError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/environments/promotions/:id/execute", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ENVIRONMENT_PROMOTE);
      const intent = await ec3l.graph.executePromotionIntent(req.tenantContext, req.params.id);
      res.json(intent);
    } catch (err) {
      if (err instanceof ec3l.graph.PromotionIntentError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/admin/environments/promotions/:id/reject", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const intent = await ec3l.graph.rejectPromotionIntent(req.tenantContext, req.params.id);
      res.json(intent);
    } catch (err) {
      if (err instanceof ec3l.graph.PromotionIntentError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  // --- Vibe Authoring Layer ---

  /**
   * GET /api/vibe/proposal?prompt=...
   * Read-only proposal generation — maps a GraphPackage to a human-readable
   * proposal summary for the Builder UI. No DB writes, no admin auth.
   */
  app.get("/api/vibe/proposal", async (req, res) => {
    try {
      const prompt = typeof req.query.prompt === "string" ? req.query.prompt.trim() : "";
      if (!prompt) {
        return res.status(400).json({ message: "prompt query parameter is required" });
      }

      const pkg = await ec3l.vibe.generatePackageFromPrompt(prompt, undefined, req.tenantContext);

      // Derive human-readable appName from packageKey
      const appName = pkg.packageKey
        .replace(/^vibe\./, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const recordTypes = pkg.recordTypes.map((rt) => rt.name || rt.key);

      const workflows = (pkg.workflows || []).map((w) => w.name);

      // Derive roles from assignment rule group keys
      const roleSet = new Set<string>();
      for (const rule of pkg.assignmentRules || []) {
        const group = (rule.config as Record<string, unknown>)?.groupKey;
        if (typeof group === "string") {
          roleSet.add(group.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
        }
      }
      const roles = Array.from(roleSet);

      // Derive approvals from SLA policies (implied oversight)
      const approvals = (pkg.slaPolicies || []).map((sla) => {
        const hours = Math.round(sla.durationMinutes / 60);
        const rtName = pkg.recordTypes.find((r) => r.key === sla.recordTypeKey)?.name || sla.recordTypeKey;
        return `SLA: ${hours}h response on ${rtName}`;
      });

      // Derive notifications from workflow notification steps
      const notifications: string[] = [];
      for (const wf of pkg.workflows || []) {
        for (const step of wf.steps || []) {
          if (step.stepType === "notification") {
            notifications.push(step.name);
          }
        }
      }

      return res.json({ appName, recordTypes, roles, workflows, approvals, notifications });
    } catch (err) {
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/preview", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { prompt, appName, projectId, package: existingPackage, refinementPrompt } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      if (existingPackage && refinementPrompt) {
        // Refine mode: apply refinement to an existing package
        const pkg: GraphPackage = await ec3l.vibe.refinePackageFromPrompt(existingPackage, refinementPrompt, req.tenantContext);
        const preview = await ec3l.vibe.previewVibePackage(req.tenantContext, projectId, pkg);
        return res.json(preview);
      }

      if (prompt) {
        // Generate mode: use repair loop for LLM generation → preview
        const result = await generateAndPreviewWithRepair(
          req.tenantContext, projectId, prompt, { appName },
        );
        return res.json(result);
      }

      return res.status(400).json({ message: "Either 'prompt' or both 'package' and 'refinementPrompt' are required" });
    } catch (err) {
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/preview/stream", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { prompt, appName, projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!prompt) return res.status(400).json({ message: "prompt is required for streaming preview" });

      // SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const sendEvent = (event: StreamStageEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await generateAndPreviewWithRepairStreaming(
          req.tenantContext,
          projectId,
          prompt,
          sendEvent,
          { appName },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        sendEvent({ stage: "error", error: message });
      }

      res.end();
    } catch (err) {
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/preview/stream-tokens", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { prompt, appName, projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!prompt) return res.status(400).json({ message: "prompt is required for token streaming" });

      // SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const sendEvent = (event: TokenStreamEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await ec3l.tokenStream.generateAndPreviewWithTokenStreaming(
          req.tenantContext,
          projectId,
          prompt,
          sendEvent,
          { appName },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        sendEvent({ type: "error", error: message });
      }

      res.end();
    } catch (err) {
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/generate-multi/stream", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { prompt, count, appName, projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!prompt) return res.status(400).json({ message: "prompt is required" });
      const variantCount = typeof count === "number" ? count : 3;
      if (variantCount < 1 || variantCount > 3) {
        return res.status(400).json({ message: "count must be between 1 and 3 for streaming" });
      }

      // SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const sendEvent = (event: TokenStreamEvent & { variantIndex?: number }) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await ec3l.tokenStream.generateMultiWithTokenStreaming(
          req.tenantContext,
          projectId,
          prompt,
          variantCount,
          sendEvent,
          { appName },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        sendEvent({ type: "error", error: message });
      }

      res.end();
    } catch (err) {
      if (err instanceof MultiStreamError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/install", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { package: pkg, projectId, environmentId } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!pkg) return res.status(400).json({ message: "package is required" });
      if (!pkg.packageKey || !pkg.version || !Array.isArray(pkg.recordTypes)) {
        return res.status(400).json({ message: "package must have packageKey, version, and recordTypes" });
      }

      const result = await ec3l.vibe.installVibePackage(req.tenantContext, projectId, pkg, { environmentId });
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  // --- Vibe Drafts ---

  app.post("/api/vibe/drafts", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId, environmentId, prompt, appName } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!prompt) return res.status(400).json({ message: "prompt is required" });

      const draft = await ec3l.vibeDraft.createDraftFromPrompt(
        req.tenantContext, projectId, environmentId ?? null, prompt, appName,
      );
      res.status(201).json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/vibe/drafts", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { projectId } = req.query;
      const ts = getTenantStorage(req.tenantContext);
      const drafts = await ts.listVibeDrafts(
        typeof projectId === "string" ? projectId : undefined,
      );
      res.json(drafts);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/refine", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);
      const { refinementPrompt } = req.body;
      if (!refinementPrompt) return res.status(400).json({ message: "refinementPrompt is required" });

      const draft = await ec3l.vibeDraft.refineDraft(
        req.tenantContext, req.params.draftId, refinementPrompt,
      );
      res.json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/preview", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const draft = await ec3l.vibeDraft.previewDraft(req.tenantContext, req.params.draftId);
      res.json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/install", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const result = await ec3l.vibeDraft.installDraft(req.tenantContext, req.params.draftId);
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/discard", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const draft = await ec3l.vibeDraft.discardDraft(req.tenantContext, req.params.draftId);
      res.json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/patch", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const { ops } = req.body;
      if (!Array.isArray(ops) || ops.length === 0) {
        return res.status(400).json({ message: "ops array is required and must be non-empty" });
      }

      const draft = await ec3l.vibeDraft.applyDraftPatchOps(req.tenantContext, req.params.draftId, ops);
      res.json(draft);
    } catch (err) {
      if (err instanceof DraftPatchOpError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/vibe/drafts/:draftId/versions", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const versions = await ec3l.vibeDraft.listDraftVersions(req.tenantContext, req.params.draftId);
      res.json(versions);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/restore", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const { versionNumber } = req.body;
      if (typeof versionNumber !== "number" || versionNumber < 1) {
        return res.status(400).json({ message: "versionNumber is required and must be a positive integer" });
      }

      const draft = await ec3l.vibeDraft.restoreDraftVersion(req.tenantContext, req.params.draftId, versionNumber);
      res.json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/versions/diff", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const { fromVersion, toVersion } = req.body;
      if (typeof fromVersion !== "number" || fromVersion < 1) {
        return res.status(400).json({ message: "fromVersion is required and must be a positive integer" });
      }
      if (typeof toVersion !== "number" || toVersion < 1) {
        return res.status(400).json({ message: "toVersion is required and must be a positive integer" });
      }

      const result = await ec3l.draftVersionDiff.diffDraftVersions(
        req.tenantContext, req.params.draftId, fromVersion, toVersion,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof DraftVersionDiffError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/generate-multi", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const { prompt, count, appName } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ message: "prompt is required" });
      }
      const variantCount = typeof count === "number" ? count : 3;
      if (variantCount < 1 || variantCount > 5) {
        return res.status(400).json({ message: "count must be between 1 and 5" });
      }

      const projectId = req.query.projectId as string || req.body.projectId;
      if (!projectId) {
        return res.status(400).json({ message: "projectId is required" });
      }

      const variants = await ec3l.multiVariant.generateVariantsWithPreview(
        req.tenantContext, projectId, prompt, variantCount, appName,
      );
      res.json({ variants });
    } catch (err) {
      if (err instanceof ec3l.multiVariant.MultiVariantError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/from-variant", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const { projectId, environmentId, prompt } = req.body;
      const pkg = req.body.package;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!pkg || typeof pkg !== "object") return res.status(400).json({ message: "package is required" });
      if (!prompt || typeof prompt !== "string") return res.status(400).json({ message: "prompt is required" });

      const draft = await ec3l.vibeDraft.createDraftFromVariant(
        req.tenantContext, projectId, environmentId ?? null, pkg as GraphPackage, prompt,
      );
      res.status(201).json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/variants/diff", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const { projectId, packageA, packageB } = req.body;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });
      if (!packageA || typeof packageA !== "object") return res.status(400).json({ message: "packageA is required" });
      if (!packageB || typeof packageB !== "object") return res.status(400).json({ message: "packageB is required" });

      const result = await ec3l.variantDiff.diffPackages(
        req.tenantContext, projectId, packageA as GraphPackage, packageB as GraphPackage,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/vibe/drafts/:draftId/adopt-variant", async (req, res) => {
    try {
      const actor = ec3l.rbac.resolveActorFromContext(req.tenantContext);
      await ec3l.rbac.authorize(req.tenantContext, actor, ec3l.rbac.PERMISSIONS.ADMIN_VIEW);

      const pkg = req.body.package;
      const prompt = req.body.prompt;
      if (!pkg || typeof pkg !== "object") return res.status(400).json({ message: "package is required" });

      const draft = await ec3l.vibeDraft.adoptVariant(
        req.tenantContext, req.params.draftId, pkg as GraphPackage, prompt,
      );
      res.json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.rbac.RbacDeniedError) {
        return res.status(403).json({ message: err.message });
      }
      throw err;
    }
  });

  // --- Timers ---
  app.post("/api/timers/process", async (req, res) => {
    const processedCount = await ec3l.timer.processDueTimers(undefined, req.tenantContext.tenantId);
    res.json({ processedCount });
  });

  // --- Record Instances ---
  app.post("/api/record-instances", async (req, res) => {
    try {
      const { recordTypeId, data } = req.body;
      if (!recordTypeId) return res.status(400).json({ message: "recordTypeId is required" });
      if (!data || typeof data !== "object") return res.status(400).json({ message: "data is required and must be an object" });
      const instance = await ec3l.recordInstance.createRecordInstance(req.tenantContext, { recordTypeId, data });
      res.status(201).json(instance);
    } catch (err) {
      if (err instanceof ec3l.recordInstance.RecordInstanceServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/record-instances", async (req, res) => {
    try {
      const { recordTypeId } = req.query;
      if (!recordTypeId) return res.status(400).json({ message: "recordTypeId query parameter is required" });
      const instances = await ec3l.recordInstance.listRecordInstancesWithSla(req.tenantContext, recordTypeId as string);
      res.json(instances);
    } catch (err) {
      if (err instanceof ec3l.recordInstance.RecordInstanceServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/record-instances/:id", async (req, res) => {
    try {
      const instance = await ec3l.recordInstance.getRecordInstance(req.tenantContext, req.params.id);
      if (!instance) return res.status(404).json({ message: "Record instance not found" });
      res.json(instance);
    } catch (err) {
      if (err instanceof ec3l.recordInstance.RecordInstanceServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.patch("/api/record-instances/:id", async (req, res) => {
    try {
      const { data } = req.body;
      if (!data || typeof data !== "object") return res.status(400).json({ message: "data is required and must be an object" });
      const instance = await ec3l.recordInstance.updateRecordInstance(req.tenantContext, req.params.id, data);
      res.json(instance);
    } catch (err) {
      if (err instanceof ec3l.recordInstance.RecordInstanceServiceError) return res.status(err.statusCode).json({ message: err.message });
      throw err;
    }
  });

  app.get("/api/audit-feed", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const feed = await ec3l.auditFeed.getAuditFeed(req.tenantContext, { limit });
    res.json(feed);
  });

  // --- Builder UI ---

  /**
   * POST /api/builder/drafts
   * Creates a vibe draft for the Builder flow. Resolves (or creates) a default
   * project so the Builder landing page doesn't require project selection.
   * No admin auth — mirrors the proposal endpoint's access level.
   */
  app.post("/api/builder/drafts", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ message: "prompt is required" });
      }

      // Resolve or create a default "Builder Apps" project for this tenant
      const projects = await ec3l.project.getProjects(req.tenantContext);
      let project = projects.find((p) => p.name === "Builder Apps") ?? projects[0];
      if (!project) {
        project = await ec3l.project.createProject(req.tenantContext, {
          name: "Builder Apps",
          githubRepo: "local/builder",
          defaultBranch: "main",
          description: "Auto-created project for Builder-generated apps",
        });
      }

      const draft = await ec3l.vibeDraft.createDraftFromPrompt(
        req.tenantContext,
        project.id,
        null, // environmentId — resolved later during install
        prompt.trim(),
      );

      return res.status(201).json({
        appId: draft.id,
        environment: "dev",
      });
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId
   * Retrieves a single vibe draft with its full package for the Draft Shell UI.
   * No admin auth — mirrors other builder endpoints.
   */
  app.get("/api/builder/drafts/:appId", async (req, res) => {
    try {
      const ts = getTenantStorage(req.tenantContext);
      const draft = await ts.getVibeDraft(req.params.appId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }
      return res.json(draft);
    } catch (err) {
      throw err;
    }
  });

  /**
   * POST /api/builder/drafts/:appId/refine
   * Refines a draft with a new prompt. No admin auth.
   */
  app.post("/api/builder/drafts/:appId/refine", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ message: "prompt is required" });
      }
      const draft = await ec3l.vibeDraft.refineDraft(
        req.tenantContext, req.params.appId, prompt.trim(),
      );
      return res.json(draft);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      if (err instanceof ec3l.vibe.VibeServiceError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId/versions
   * Lists all version snapshots for a draft. No admin auth.
   */
  app.get("/api/builder/drafts/:appId/versions", async (req, res) => {
    try {
      const versions = await ec3l.vibeDraft.listDraftVersions(
        req.tenantContext, req.params.appId,
      );
      return res.json(versions);
    } catch (err) {
      if (err instanceof ec3l.vibeDraft.VibeDraftError) {
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId/versions/:version
   * Retrieves a single version snapshot. No admin auth.
   */
  app.get("/api/builder/drafts/:appId/versions/:version", async (req, res) => {
    try {
      const versionNumber = parseInt(req.params.version, 10);
      if (isNaN(versionNumber) || versionNumber < 1) {
        return res.status(400).json({ message: "version must be a positive integer" });
      }
      const ts = getTenantStorage(req.tenantContext);
      const version = await ts.getVibeDraftVersion(req.params.appId, versionNumber);
      if (!version) {
        return res.status(404).json({ message: "Version not found" });
      }
      return res.json(version);
    } catch (err) {
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId/preflight
   * Structural validation of current draft package. Read-only, no admin auth.
   */
  app.get("/api/builder/drafts/:appId/preflight", async (req, res) => {
    try {
      const ts = getTenantStorage(req.tenantContext);
      const draft = await ts.getVibeDraft(req.params.appId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }

      const pkg = draft.package as Record<string, unknown>;
      const recordTypes = (pkg.recordTypes ?? []) as Array<{
        key: string; name?: string; baseType?: string;
        fields: Array<{ name: string; type: string; required?: boolean }>;
      }>;
      const workflows = (pkg.workflows ?? []) as Array<{
        key: string; name: string; recordTypeKey: string; triggerEvent?: string;
        steps?: Array<{ name: string; stepType: string; ordering: number }>;
      }>;
      const slaPolicies = (pkg.slaPolicies ?? []) as Array<{
        recordTypeKey: string; durationMinutes: number;
      }>;
      const assignmentRules = (pkg.assignmentRules ?? []) as Array<{
        recordTypeKey: string; strategyType: string; config?: Record<string, unknown>;
      }>;

      const rtKeys = new Set(recordTypes.map((rt) => rt.key));
      const checks: Array<{
        type: string; entity: string; severity: "error" | "warning"; message: string;
      }> = [];

      // --- Record Type checks ---
      for (const rt of recordTypes) {
        if (!rt.fields || rt.fields.length === 0) {
          checks.push({
            type: "recordType", entity: rt.key, severity: "error",
            message: `Record type "${rt.key}" has no fields defined.`,
          });
        }
        const fieldNames = new Set<string>();
        for (const f of rt.fields ?? []) {
          if (fieldNames.has(f.name)) {
            checks.push({
              type: "recordType", entity: rt.key, severity: "error",
              message: `Record type "${rt.key}" has duplicate field "${f.name}".`,
            });
          }
          fieldNames.add(f.name);
        }
        if (rt.baseType && !rtKeys.has(rt.baseType)) {
          checks.push({
            type: "recordType", entity: rt.key, severity: "error",
            message: `Record type "${rt.key}" declares baseType "${rt.baseType}" which does not exist in this package.`,
          });
        }
      }

      // --- Workflow checks ---
      for (const wf of workflows) {
        if (!rtKeys.has(wf.recordTypeKey)) {
          checks.push({
            type: "workflow", entity: wf.key, severity: "error",
            message: `Workflow "${wf.name}" references record type "${wf.recordTypeKey}" which does not exist.`,
          });
        }
        if (!wf.steps || wf.steps.length === 0) {
          checks.push({
            type: "workflow", entity: wf.key, severity: "warning",
            message: `Workflow "${wf.name}" has no steps defined.`,
          });
        }
      }

      // --- SLA checks ---
      for (const sla of slaPolicies) {
        if (!rtKeys.has(sla.recordTypeKey)) {
          checks.push({
            type: "sla", entity: sla.recordTypeKey, severity: "error",
            message: `SLA policy references record type "${sla.recordTypeKey}" which does not exist.`,
          });
        }
        if (!sla.durationMinutes || sla.durationMinutes <= 0) {
          checks.push({
            type: "sla", entity: sla.recordTypeKey, severity: "error",
            message: `SLA policy for "${sla.recordTypeKey}" has invalid duration (${sla.durationMinutes}).`,
          });
        }
      }

      // --- Assignment checks ---
      const validStrategies = new Set(["round_robin", "group_round_robin", "field_match", "direct", "manual"]);
      for (const rule of assignmentRules) {
        if (!rtKeys.has(rule.recordTypeKey)) {
          checks.push({
            type: "assignment", entity: rule.recordTypeKey, severity: "error",
            message: `Assignment rule references record type "${rule.recordTypeKey}" which does not exist.`,
          });
        }
        if (!validStrategies.has(rule.strategyType)) {
          checks.push({
            type: "assignment", entity: rule.recordTypeKey, severity: "warning",
            message: `Assignment rule for "${rule.recordTypeKey}" uses unknown strategy "${rule.strategyType}".`,
          });
        }
      }

      // --- RBAC checks ---
      const roles = await storage.getRbacRolesByTenant(req.tenantContext.tenantId);
      const roleNames = new Set(roles.map((r) => r.name.toLowerCase()));
      for (const rule of assignmentRules) {
        const groupKey = (rule.config as Record<string, unknown> | undefined)?.groupKey;
        if (typeof groupKey === "string") {
          const normalized = groupKey.replace(/_/g, " ").toLowerCase();
          if (!roleNames.has(normalized) && !roleNames.has(groupKey.toLowerCase())) {
            checks.push({
              type: "rbac", entity: groupKey, severity: "warning",
              message: `Assignment group "${groupKey}" does not match any tenant role. Ensure a matching role exists before promotion.`,
            });
          }
        }
      }

      const errorCount = checks.filter((c) => c.severity === "error").length;
      const warningCount = checks.filter((c) => c.severity === "warning").length;
      const status = errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ready";

      return res.json({ status, summary: { errors: errorCount, warnings: warningCount }, checks });
    } catch (err) {
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId/diff?from=1&to=3
   * Version-to-version structural diff. Read-only, no admin auth.
   */
  app.get("/api/builder/drafts/:appId/diff", async (req, res) => {
    try {
      const fromVersion = parseInt(req.query.from as string, 10);
      const toVersion = parseInt(req.query.to as string, 10);
      if (isNaN(fromVersion) || isNaN(toVersion) || fromVersion < 1 || toVersion < 1) {
        return res.status(400).json({ message: "from and to must be positive integers" });
      }
      if (fromVersion === toVersion) {
        return res.status(400).json({ message: "from and to must be different versions" });
      }

      const result = await ec3l.draftVersionDiff.diffDraftVersions(
        req.tenantContext,
        req.params.appId,
        fromVersion,
        toVersion,
      );

      const { diff } = result;
      const bc = diff.bindingChanges;

      return res.json({
        summary: {
          recordTypesAdded: diff.addedRecordTypes.length,
          recordTypesRemoved: diff.removedRecordTypes.length,
          recordTypesModified: diff.modifiedRecordTypes.length,
          workflowsAdded: bc.workflowsAdded.length,
          workflowsRemoved: bc.workflowsRemoved.length,
          slasAdded: bc.slasAdded.length,
          slasRemoved: bc.slasRemoved.length,
          assignmentsAdded: bc.assignmentsAdded.length,
          assignmentsRemoved: bc.assignmentsRemoved.length,
        },
        changes: {
          added: [
            ...diff.addedRecordTypes.map((rt) => ({ category: "Record Type", key: rt.key })),
            ...bc.workflowsAdded.map((w) => ({ category: "Workflow", key: w })),
            ...bc.slasAdded.map((s) => ({ category: "SLA Policy", key: s })),
            ...bc.assignmentsAdded.map((a) => ({ category: "Assignment Rule", key: a })),
          ],
          removed: [
            ...diff.removedRecordTypes.map((rt) => ({ category: "Record Type", key: rt.key })),
            ...bc.workflowsRemoved.map((w) => ({ category: "Workflow", key: w })),
            ...bc.slasRemoved.map((s) => ({ category: "SLA Policy", key: s })),
            ...bc.assignmentsRemoved.map((a) => ({ category: "Assignment Rule", key: a })),
          ],
          modified: diff.modifiedRecordTypes.map((rt) => ({
            category: "Record Type",
            key: rt.recordTypeKey,
            details: [
              ...rt.fieldAdds.map((f) => `+ ${f}`),
              ...rt.fieldRemovals.map((f) => `- ${f}`),
              ...rt.fieldTypeChanges.map((f) => `~ ${f} (type changed)`),
            ],
          })),
        },
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err) {
        const e = err as { statusCode: number; message: string };
        return res.status(e.statusCode).json({ message: e.message });
      }
      throw err;
    }
  });

  /**
   * POST /api/builder/drafts/:appId/promote-intent
   * Create a promotion intent DEV → TEST for the draft's project. No admin auth.
   */
  app.post("/api/builder/drafts/:appId/promote-intent", async (req, res) => {
    try {
      const ts = getTenantStorage(req.tenantContext);
      const draft = await ts.getVibeDraft(req.params.appId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }

      const envs = await ts.getEnvironmentsByProject(draft.projectId);
      const devEnv = envs.find((e) => e.name === "dev");
      const testEnv = envs.find((e) => e.name === "test");
      if (!devEnv || !testEnv) {
        return res.status(400).json({ message: "DEV and TEST environments must exist for this project." });
      }

      const intent = await ec3l.graph.createPromotionIntent(req.tenantContext, {
        projectId: draft.projectId,
        fromEnvironmentId: devEnv.id,
        toEnvironmentId: testEnv.id,
        createdBy: req.tenantContext.userId ?? undefined,
      });

      return res.json({
        intentId: intent.id,
        status: intent.status,
        fromEnv: "dev",
        toEnv: "test",
        createdAt: intent.createdAt,
        createdBy: intent.createdBy,
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err) {
        const e = err as { statusCode: number; message: string };
        return res.status(e.statusCode).json({ message: e.message });
      }
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId/promote-intents
   * List promotion intents for the draft's project. No admin auth.
   */
  app.get("/api/builder/drafts/:appId/promote-intents", async (req, res) => {
    try {
      const ts = getTenantStorage(req.tenantContext);
      const draft = await ts.getVibeDraft(req.params.appId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }

      const intents = await ts.listPromotionIntents(draft.projectId);
      const envs = await ts.getEnvironmentsByProject(draft.projectId);
      const envMap = new Map(envs.map((e) => [e.id, e.name]));

      return res.json(
        intents.map((i) => ({
          intentId: i.id,
          status: i.status,
          fromEnv: envMap.get(i.fromEnvironmentId) ?? i.fromEnvironmentId,
          toEnv: envMap.get(i.toEnvironmentId) ?? i.toEnvironmentId,
          createdAt: i.createdAt,
          createdBy: i.createdBy,
        })),
      );
    } catch (err) {
      throw err;
    }
  });

  /**
   * GET /api/builder/drafts/:appId/prod-state
   * Check if PROD has an installed package matching this draft's packageKey.
   * Returns PROD info or null. No admin auth.
   */
  app.get("/api/builder/drafts/:appId/prod-state", async (req, res) => {
    try {
      const ts = getTenantStorage(req.tenantContext);
      const draft = await ts.getVibeDraft(req.params.appId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }

      const pkg = draft.package as { packageKey?: string };
      if (!pkg.packageKey) {
        return res.json({ available: false });
      }

      const envs = await ts.getEnvironmentsByProject(draft.projectId);
      const prodEnv = envs.find((e) => e.name === "prod");
      if (!prodEnv) {
        return res.json({ available: false });
      }

      const install = await ts.getLatestEnvironmentPackageInstall(prodEnv.id, pkg.packageKey);
      if (!install) {
        return res.json({ available: false });
      }

      return res.json({
        available: true,
        packageKey: install.packageKey,
        version: install.version,
        checksum: install.checksum,
        installedAt: install.installedAt,
        installedBy: install.installedBy,
        source: install.source,
      });
    } catch (err) {
      throw err;
    }
  });

  /**
   * POST /api/builder/drafts/:appId/pull-down
   * Clone PROD package into a new DEV draft. No admin auth.
   * Does not modify PROD or existing draft.
   */
  app.post("/api/builder/drafts/:appId/pull-down", async (req, res) => {
    try {
      const ts = getTenantStorage(req.tenantContext);
      const draft = await ts.getVibeDraft(req.params.appId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }

      const pkg = draft.package as { packageKey?: string };
      if (!pkg.packageKey) {
        return res.status(400).json({ message: "Draft has no packageKey" });
      }

      const envs = await ts.getEnvironmentsByProject(draft.projectId);
      const prodEnv = envs.find((e) => e.name === "prod");
      if (!prodEnv) {
        return res.status(400).json({ message: "No PROD environment found for this project." });
      }

      const install = await ts.getLatestEnvironmentPackageInstall(prodEnv.id, pkg.packageKey);
      if (!install) {
        return res.status(400).json({ message: `No installed package "${pkg.packageKey}" found in PROD.` });
      }

      const prodPackage = install.packageContents as unknown as import("./graph/installGraphService").GraphPackage;

      const pulledAt = new Date().toISOString();
      const lineage = {
        pulledFromProd: true,
        sourceEnvironment: "prod",
        sourceVersion: install.version,
        sourceChecksum: install.checksum,
        sourceInstalledAt: install.installedAt,
        sourceDraftId: req.params.appId,
        pulledAt,
      };

      const newDraft = await ec3l.vibeDraft.createDraftFromVariant(
        req.tenantContext,
        draft.projectId,
        null,
        prodPackage,
        `Pulled from PROD (v${install.version}) at ${pulledAt}`,
        lineage,
      );

      return res.json({
        newAppId: newDraft.id,
        version: install.version,
        lineage: {
          pulledFromProd: true,
          sourceVersion: install.version,
          sourceChecksum: install.checksum,
          sourceInstalledAt: install.installedAt,
          sourceDraftId: req.params.appId,
        },
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "statusCode" in err) {
        const e = err as { statusCode: number; message: string };
        return res.status(e.statusCode).json({ message: e.message });
      }
      throw err;
    }
  });

  ec3l.scheduler.startScheduler();

  return httpServer;
}
