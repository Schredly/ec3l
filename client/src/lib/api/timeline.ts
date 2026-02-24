import { apiRequest } from "@/lib/queryClient";

export type TimelineEntryType = "change" | "draft" | "promotion-intent" | "pull-down";

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
}

export async function fetchTimeline(): Promise<TimelineEntry[]> {
  const res = await apiRequest("GET", "/api/changes/timeline");
  return res.json();
}
