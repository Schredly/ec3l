import { apiRequest } from "../queryClient";

export interface SharedRole {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
}

export interface SharedAssignmentRule {
  recordTypeKey: string;
  recordTypeName: string;
  strategyType: string;
  groupKey: string | null;
  field: string | null;
  userId: string | null;
  recordTypeStatus: string;
}

export interface SharedSlaPolicy {
  recordTypeKey: string;
  recordTypeName: string;
  durationMinutes: number;
  recordTypeStatus: string;
}

export interface SharedWorkflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export interface SharedPrimitivesResult {
  roles: SharedRole[];
  assignmentRules: SharedAssignmentRule[];
  slaPolicies: SharedSlaPolicy[];
  workflows: SharedWorkflow[];
}

export async function fetchSharedPrimitives(): Promise<SharedPrimitivesResult> {
  const res = await apiRequest("GET", "/api/primitives/shared");
  return res.json();
}
