import { apiRequest } from "@/lib/queryClient";

export type TimelineEntryType = "change" | "draft" | "promotion-intent" | "pull-down";

export interface DiffSummarySection {
  added: number;
  removed: number;
  modified?: number;
}

export interface DiffSummary {
  recordTypes: DiffSummarySection & { modified: number };
  workflows: DiffSummarySection;
  slaPolicies: DiffSummarySection;
  assignmentRules: DiffSummarySection;
}

export interface TimelineEntryDiff {
  available: boolean;
  kind: string;
  fromLabel?: string;
  toLabel?: string;
  summary?: DiffSummary;
}

export interface TimelineEntryAudit {
  tenantSlug: string;
  entityId: string;
  entityType: TimelineEntryType;
  createdAtIso: string;
  createdBy: string;
  source?: string;
  requestId?: string;
}

export interface TimelineEntry {
  id: string;
  type: TimelineEntryType;
  title: string;
  createdAt: string;
  createdBy: string;
  status?: string;
  fromEnv?: string;
  toEnv?: string;
  draftId?: string;
  version?: number;
  aiGenerated?: boolean;
  diff?: TimelineEntryDiff;
  audit?: TimelineEntryAudit;
}

export async function fetchTimeline(): Promise<TimelineEntry[]> {
  const res = await apiRequest("GET", "/api/changes/timeline");
  return res.json();
}
