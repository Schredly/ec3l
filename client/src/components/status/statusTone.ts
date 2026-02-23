import type { StatusTone } from "./StatusBadge";

interface ToneResult {
  tone: StatusTone;
  labelOverride?: string;
  title?: string;
}

const CHANGE_STATUS_MAP: Record<string, ToneResult> = {
  Draft: { tone: "neutral" },
  Implementing: { tone: "info" },
  WorkspaceRunning: { tone: "info", labelOverride: "Workspace Running" },
  Validating: { tone: "warning" },
  ValidationFailed: { tone: "danger", labelOverride: "Validation Failed" },
  Ready: { tone: "success" },
  Merged: { tone: "success" },
};

const WORKFLOW_EXECUTION_MAP: Record<string, ToneResult> = {
  pending: { tone: "neutral", labelOverride: "Pending" },
  running: { tone: "info", labelOverride: "Running" },
  dispatched: { tone: "info", labelOverride: "Dispatched" },
  completed: { tone: "success", labelOverride: "Completed" },
  failed: { tone: "danger", labelOverride: "Failed" },
  duplicate: { tone: "neutral", labelOverride: "Duplicate" },
};

const SLA_STATUS_MAP: Record<string, ToneResult> = {
  pending: { tone: "warning", labelOverride: "Pending", title: "SLA timer active" },
  breached: { tone: "danger", labelOverride: "Breached", title: "SLA breached" },
  completed: { tone: "success", labelOverride: "Completed", title: "SLA completed within target" },
};

const VIBE_DRAFT_MAP: Record<string, ToneResult> = {
  draft: { tone: "neutral", labelOverride: "Draft" },
  previewed: { tone: "info", labelOverride: "Previewed" },
  installed: { tone: "success", labelOverride: "Installed" },
  discarded: { tone: "danger", labelOverride: "Discarded" },
};

const PROMOTION_INTENT_MAP: Record<string, ToneResult> = {
  draft: { tone: "neutral", labelOverride: "Draft" },
  previewed: { tone: "info", labelOverride: "Previewed" },
  approved: { tone: "success", labelOverride: "Approved" },
  executed: { tone: "success", labelOverride: "Executed" },
  rejected: { tone: "danger", labelOverride: "Rejected" },
};

function resolve(map: Record<string, ToneResult>, status: string): ToneResult {
  return map[status] ?? { tone: "neutral" };
}

export function getToneForChangeStatus(status: string): ToneResult {
  return resolve(CHANGE_STATUS_MAP, status);
}

export function getToneForWorkflowExecutionStatus(status: string): ToneResult {
  return resolve(WORKFLOW_EXECUTION_MAP, status);
}

export function getToneForSlaStatus(status: string): ToneResult {
  return resolve(SLA_STATUS_MAP, status);
}

export function getToneForVibeDraftStatus(status: string): ToneResult {
  return resolve(VIBE_DRAFT_MAP, status);
}

export function getToneForPromotionIntentStatus(status: string): ToneResult {
  return resolve(PROMOTION_INTENT_MAP, status);
}
