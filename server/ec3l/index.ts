// Platform namespace wrapper — single import surface for all EC3L services.
// Do NOT move or rename service files. This is a boundary-level facade only.

import * as project from "../services/projectService";
import * as change from "../services/changeService";
import * as workspace from "../services/workspaceService";
import * as agentRun from "../services/agentRunService";
import * as moduleService from "../services/moduleService";
import * as environment from "../services/environmentService";
import * as template from "../services/templateService";
import * as install from "../services/installService";
import * as override from "../services/overrideService";
import * as workflow from "../services/workflowService";
import * as trigger from "../services/triggerService";
import * as form from "../services/formService";
import * as rbac from "../services/rbacService";
import * as agentProposal from "../services/agentProposalService";
import * as auditFeed from "../services/auditFeedService";
import * as changeTarget from "../services/changeTargetService";
import * as recordType from "../services/recordTypeService";
import * as patchOp from "../services/patchOpService";
import * as patchOpExecutor from "../executors/patchOpExecutor";
import * as intentDispatcher from "../services/intentDispatcher";
import * as scheduler from "../services/schedulerService";
import * as hrLite from "../services/hrLiteInstaller";
import * as agentGuard from "../services/agentGuardService";
import * as recordInstance from "../services/recordInstanceService";

export const ec3l = {
  project,
  change,
  workspace,
  agentRun,
  module: moduleService,
  environment,
  template,
  install,
  override,
  workflow,
  trigger,
  form,
  rbac,
  agentProposal,
  auditFeed,
  changeTarget,
  recordType,
  patchOp,
  patchOpExecutor,
  intentDispatcher,
  scheduler,
  hrLite,
  agentGuard,
  recordInstance,
} as const;
