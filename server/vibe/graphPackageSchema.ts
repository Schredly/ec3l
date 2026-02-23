import { z } from "zod";
import type { GraphPackage } from "../graph/installGraphService";
import { VibeServiceError } from "./vibeService";

const graphPackageFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
}).strict();

const graphPackageRecordTypeSchema = z.object({
  key: z.string().min(1),
  name: z.string().optional(),
  baseType: z.string().optional(),
  fields: z.array(graphPackageFieldSchema).min(1),
}).strict();

const graphPackageDependencySchema = z.object({
  packageKey: z.string().min(1),
  minVersion: z.string().optional(),
}).strict();

const graphPackageSLAPolicySchema = z.object({
  recordTypeKey: z.string().min(1),
  durationMinutes: z.number().int().positive(),
}).strict();

const graphPackageAssignmentRuleSchema = z.object({
  recordTypeKey: z.string().min(1),
  strategyType: z.string().min(1),
  config: z.record(z.unknown()).optional(),
}).strict();

const graphPackageWorkflowStepSchema = z.object({
  name: z.string().min(1),
  stepType: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  ordering: z.number().int().nonnegative(),
}).strict();

const graphPackageWorkflowSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  recordTypeKey: z.string().min(1),
  triggerEvent: z.string().optional(),
  steps: z.array(graphPackageWorkflowStepSchema).optional(),
}).strict();

export const graphPackageSchema = z.object({
  packageKey: z.string().min(1),
  version: z.string().min(1),
  dependsOn: z.array(graphPackageDependencySchema).optional(),
  recordTypes: z.array(graphPackageRecordTypeSchema).min(1),
  slaPolicies: z.array(graphPackageSLAPolicySchema).optional(),
  assignmentRules: z.array(graphPackageAssignmentRuleSchema).optional(),
  workflows: z.array(graphPackageWorkflowSchema).optional(),
}).strict();

export type ValidatedGraphPackage = z.infer<typeof graphPackageSchema>;

/**
 * Validate raw (untrusted) input against the GraphPackage Zod schema.
 * Returns the validated result cast to the existing GraphPackage interface.
 * Throws VibeServiceError on validation failure.
 */
export function validateGraphPackage(raw: unknown): GraphPackage {
  const result = graphPackageSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new VibeServiceError(
      `INVALID_GENERATED_PACKAGE: ${details}`,
      422,
    );
  }
  return result.data as GraphPackage;
}
