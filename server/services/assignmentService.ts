import type { RecordType } from "@shared/schema";

interface StaticConfig {
  type: "static_user" | "static_group";
  value: string;
}

interface FieldMatchRule {
  equals: string;
  assignUser?: string;
  assignGroup?: string;
}

interface FieldMatchConfig {
  type: "field_match";
  field: string;
  rules: FieldMatchRule[];
  default?: { assignUser?: string; assignGroup?: string };
}

type AssignmentConfig = StaticConfig | FieldMatchConfig;

export interface AssignmentResult {
  assignedTo?: string;
  assignedGroup?: string;
}

function resolveFieldMatch(config: FieldMatchConfig, recordData: Record<string, unknown>): AssignmentResult | null {
  if (!config.field || !Array.isArray(config.rules)) return null;

  const value = recordData[config.field];
  if (value !== undefined && value !== null) {
    const matched = config.rules.find((r) => r.equals === value);
    if (matched) {
      if (matched.assignUser) return { assignedTo: matched.assignUser };
      if (matched.assignGroup) return { assignedGroup: matched.assignGroup };
    }
  }

  if (config.default) {
    if (config.default.assignUser) return { assignedTo: config.default.assignUser };
    if (config.default.assignGroup) return { assignedGroup: config.default.assignGroup };
  }

  return null;
}

/**
 * Resolve assignment from record type config. Pure logic, no side effects.
 */
export function resolveAssignment(recordType: RecordType, recordData?: Record<string, unknown>): AssignmentResult | null {
  const config = recordType.assignmentConfig as AssignmentConfig | null;
  if (!config || !config.type) return null;

  if (config.type === "static_user" && config.value) {
    return { assignedTo: config.value };
  }

  if (config.type === "static_group" && config.value) {
    return { assignedGroup: config.value };
  }

  if (config.type === "field_match") {
    return resolveFieldMatch(config, recordData ?? {});
  }

  return null;
}
