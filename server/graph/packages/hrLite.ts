import type { GraphPackage } from "../installGraphService";

/**
 * HR Lite — a minimal human-resources graph package.
 *
 * Record types:
 *   person        (base)     — shared identity fields
 *   employee      (→ person) — employment-specific fields
 *   department    (standalone)
 *   hr_case       (standalone) — case management for HR workflows
 *
 * Bindings:
 *   SLA: hr_case → 1440 minutes (24 hours)
 *   Assignment: hr_case → static_group "hr_ops"
 *   Workflow: hr_case_triage → auto-triggered on hr_case record_created
 *
 * Exercises: inheritance (employee → person), cross-type references
 * (hr_case → employee, hr_case → department), field types, and
 * all three binding categories (SLA, assignment, workflow).
 */
export const hrLitePackage: GraphPackage = {
  packageKey: "hr.lite",
  version: "0.2.0",
  dependsOn: [],
  recordTypes: [
    {
      key: "person",
      name: "Person",
      fields: [
        { name: "first_name", type: "string", required: true },
        { name: "last_name", type: "string", required: true },
        { name: "email", type: "string" },
        { name: "phone", type: "string" },
      ],
    },
    {
      key: "employee",
      name: "Employee",
      baseType: "person",
      fields: [
        { name: "employee_id", type: "string", required: true },
        { name: "hire_date", type: "date" },
        { name: "department_ref", type: "reference" },
        { name: "job_title", type: "string" },
        { name: "status", type: "choice" },
      ],
    },
    {
      key: "department",
      name: "Department",
      fields: [
        { name: "name", type: "string", required: true },
        { name: "code", type: "string", required: true },
        { name: "manager_ref", type: "reference" },
        { name: "parent_department_ref", type: "reference" },
      ],
    },
    {
      key: "hr_case",
      name: "HR Case",
      fields: [
        { name: "subject", type: "string", required: true },
        { name: "employee_ref", type: "reference", required: true },
        { name: "department_ref", type: "reference" },
        { name: "status", type: "choice", required: true },
        { name: "priority", type: "choice" },
        { name: "description", type: "string" },
        { name: "resolution", type: "string" },
      ],
    },
  ],
  slaPolicies: [
    { recordTypeKey: "hr_case", durationMinutes: 1440 },
  ],
  assignmentRules: [
    {
      recordTypeKey: "hr_case",
      strategyType: "static_group",
      config: { groupKey: "hr_ops" },
    },
  ],
  workflows: [
    {
      key: "hr_case_triage",
      name: "HR Case Triage",
      recordTypeKey: "hr_case",
      triggerEvent: "record_created",
      steps: [
        {
          name: "Auto-assign to HR team",
          stepType: "assignment",
          config: { targetGroup: "hr_ops" },
          ordering: 1,
        },
        {
          name: "Notify HR manager",
          stepType: "notification",
          config: { template: "hr_case_opened" },
          ordering: 2,
        },
      ],
    },
  ],
};
