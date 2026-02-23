import type { GraphPackage } from "../installGraphService";

/**
 * ITSM Lite — a minimal IT service management graph package.
 *
 * Record types:
 *   cmdb_ci    (base)       — configuration item (asset baseline)
 *   incident   (standalone) — break/fix tickets
 *   problem    (standalone) — root-cause investigation
 *   change     (standalone) — planned infrastructure change requests
 *
 * Bindings:
 *   SLA: incident → 240 minutes (4 hours)
 *   Assignment: incident → static_group "itsm_tier1"
 *   Workflow: incident_intake → auto-triggered on incident record_created
 *     Step 1: record_mutation — set state to "new"
 *     Step 2: notification   — notify tier-1 queue
 *
 * Exercises: four standalone types with cross-reference (ci_ref),
 * SLA enforcement, static-group assignment, and intake workflow.
 * Designed for promotion lifecycle demos (dev → staging → prod).
 */
export const itsmLitePackage: GraphPackage = {
  packageKey: "itsm.lite",
  version: "0.1.0",
  dependsOn: [],
  recordTypes: [
    {
      key: "cmdb_ci",
      name: "Configuration Item",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "ci_class", type: "choice", required: true },
        { name: "status", type: "choice", required: true },
        { name: "owner", type: "string" },
      ],
    },
    {
      key: "incident",
      name: "Incident",
      fields: [
        { name: "number", type: "string", required: true },
        { name: "short_description", type: "string", required: true },
        { name: "description", type: "text" },
        { name: "state", type: "choice", required: true },
        { name: "priority", type: "choice", required: true },
        { name: "caller", type: "string" },
        { name: "ci_ref", type: "reference" },
      ],
    },
    {
      key: "problem",
      name: "Problem",
      fields: [
        { name: "number", type: "string", required: true },
        { name: "short_description", type: "string", required: true },
        { name: "state", type: "choice", required: true },
        { name: "priority", type: "choice", required: true },
        { name: "ci_ref", type: "reference" },
      ],
    },
    {
      key: "itsm_change",
      name: "Change Request",
      fields: [
        { name: "number", type: "string", required: true },
        { name: "short_description", type: "string", required: true },
        { name: "state", type: "choice", required: true },
        { name: "risk", type: "choice", required: true },
        { name: "impact", type: "choice", required: true },
      ],
    },
  ],
  slaPolicies: [
    { recordTypeKey: "incident", durationMinutes: 240 },
  ],
  assignmentRules: [
    {
      recordTypeKey: "incident",
      strategyType: "static_group",
      config: { groupKey: "itsm_tier1" },
    },
  ],
  workflows: [
    {
      key: "incident_intake",
      name: "Incident Intake",
      recordTypeKey: "incident",
      triggerEvent: "record_created",
      steps: [
        {
          name: "Set state to new",
          stepType: "record_mutation",
          config: { field: "state", value: "new" },
          ordering: 1,
        },
        {
          name: "Notify tier-1 queue",
          stepType: "notification",
          config: { template: "incident_opened", targetGroup: "itsm_tier1" },
          ordering: 2,
        },
      ],
    },
  ],
};
