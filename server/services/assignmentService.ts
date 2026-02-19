import type { RecordType } from "@shared/schema";

interface AssignmentConfig {
  type: string;
  value: string;
}

export interface AssignmentResult {
  assignedTo?: string;
  assignedGroup?: string;
}

/**
 * Resolve assignment from record type config. Pure logic, no side effects.
 */
export function resolveAssignment(recordType: RecordType): AssignmentResult | null {
  const config = recordType.assignmentConfig as AssignmentConfig | null;
  if (!config || !config.type || !config.value) return null;

  if (config.type === "static_user") {
    return { assignedTo: config.value };
  }

  if (config.type === "static_group") {
    return { assignedGroup: config.value };
  }

  return null;
}
