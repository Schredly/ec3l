import type { GraphPackage } from "../graph/installGraphService";

/**
 * Vibe starter app templates — deterministic GraphPackage definitions
 * that can be selected by keyword matching in vibeService.
 *
 * Each template is a fully-formed GraphPackage with record types,
 * optional SLA policies, assignment rules, and workflows.
 * The packageKey uses a `vibe.` prefix to distinguish from built-in
 * or user-authored packages.
 */

export const onboardingAppTemplate: GraphPackage = {
  packageKey: "vibe.onboarding",
  version: "0.1.0",
  dependsOn: [],
  recordTypes: [
    {
      key: "onboard_request",
      name: "Onboarding Request",
      fields: [
        { name: "employee_name", type: "string", required: true },
        { name: "start_date", type: "date", required: true },
        { name: "department", type: "string", required: true },
        { name: "manager", type: "string" },
        { name: "status", type: "choice", required: true },
        { name: "notes", type: "text" },
      ],
    },
    {
      key: "onboard_task",
      name: "Onboarding Task",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "request_ref", type: "reference", required: true },
        { name: "assigned_to", type: "string" },
        { name: "due_date", type: "date" },
        { name: "status", type: "choice", required: true },
        { name: "category", type: "choice" },
      ],
    },
  ],
  slaPolicies: [
    { recordTypeKey: "onboard_request", durationMinutes: 4320 }, // 3 days
  ],
  assignmentRules: [
    {
      recordTypeKey: "onboard_request",
      strategyType: "static_group",
      config: { groupKey: "hr_onboarding" },
    },
  ],
  workflows: [
    {
      key: "onboard_intake",
      name: "Onboarding Intake",
      recordTypeKey: "onboard_request",
      triggerEvent: "record_created",
      steps: [
        {
          name: "Set status to pending",
          stepType: "record_mutation",
          config: { field: "status", value: "pending" },
          ordering: 1,
        },
        {
          name: "Notify HR onboarding team",
          stepType: "notification",
          config: { template: "onboard_request_opened", targetGroup: "hr_onboarding" },
          ordering: 2,
        },
      ],
    },
  ],
};

export const ptoRequestAppTemplate: GraphPackage = {
  packageKey: "vibe.pto",
  version: "0.1.0",
  dependsOn: [],
  recordTypes: [
    {
      key: "pto_request",
      name: "PTO Request",
      fields: [
        { name: "requester", type: "string", required: true },
        { name: "start_date", type: "date", required: true },
        { name: "end_date", type: "date", required: true },
        { name: "reason", type: "text" },
        { name: "status", type: "choice", required: true },
        { name: "approver", type: "string" },
        { name: "hours_requested", type: "number" },
      ],
    },
    {
      key: "pto_balance",
      name: "PTO Balance",
      fields: [
        { name: "employee", type: "string", required: true },
        { name: "year", type: "number", required: true },
        { name: "total_hours", type: "number", required: true },
        { name: "used_hours", type: "number", required: true },
        { name: "remaining_hours", type: "number" },
      ],
    },
  ],
  slaPolicies: [
    { recordTypeKey: "pto_request", durationMinutes: 1440 }, // 24 hours
  ],
  assignmentRules: [
    {
      recordTypeKey: "pto_request",
      strategyType: "static_group",
      config: { groupKey: "pto_approvers" },
    },
  ],
  workflows: [
    {
      key: "pto_approval",
      name: "PTO Approval",
      recordTypeKey: "pto_request",
      triggerEvent: "record_created",
      steps: [
        {
          name: "Set status to pending approval",
          stepType: "record_mutation",
          config: { field: "status", value: "pending_approval" },
          ordering: 1,
        },
        {
          name: "Notify manager",
          stepType: "notification",
          config: { template: "pto_request_submitted", targetGroup: "pto_approvers" },
          ordering: 2,
        },
      ],
    },
  ],
};

export const vendorIntakeAppTemplate: GraphPackage = {
  packageKey: "vibe.vendor_intake",
  version: "0.1.0",
  dependsOn: [],
  recordTypes: [
    {
      key: "vendor",
      name: "Vendor",
      fields: [
        { name: "company_name", type: "string", required: true },
        { name: "contact_name", type: "string", required: true },
        { name: "contact_email", type: "string", required: true },
        { name: "phone", type: "string" },
        { name: "category", type: "choice", required: true },
        { name: "status", type: "choice", required: true },
        { name: "tax_id", type: "string" },
      ],
    },
    {
      key: "vendor_review",
      name: "Vendor Review",
      fields: [
        { name: "vendor_ref", type: "reference", required: true },
        { name: "reviewer", type: "string", required: true },
        { name: "risk_level", type: "choice", required: true },
        { name: "compliance_check", type: "choice", required: true },
        { name: "notes", type: "text" },
        { name: "decision", type: "choice" },
      ],
    },
  ],
  slaPolicies: [
    { recordTypeKey: "vendor", durationMinutes: 10080 }, // 7 days
  ],
  assignmentRules: [
    {
      recordTypeKey: "vendor",
      strategyType: "static_group",
      config: { groupKey: "procurement" },
    },
  ],
  workflows: [
    {
      key: "vendor_onboard",
      name: "Vendor Onboarding",
      recordTypeKey: "vendor",
      triggerEvent: "record_created",
      steps: [
        {
          name: "Set status to under review",
          stepType: "record_mutation",
          config: { field: "status", value: "under_review" },
          ordering: 1,
        },
        {
          name: "Notify procurement team",
          stepType: "notification",
          config: { template: "vendor_submitted", targetGroup: "procurement" },
          ordering: 2,
        },
      ],
    },
  ],
};

export const simpleTicketingAppTemplate: GraphPackage = {
  packageKey: "vibe.ticketing",
  version: "0.1.0",
  dependsOn: [],
  recordTypes: [
    {
      key: "ticket",
      name: "Ticket",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "description", type: "text", required: true },
        { name: "status", type: "choice", required: true },
        { name: "priority", type: "choice", required: true },
        { name: "reporter", type: "string", required: true },
        { name: "assignee", type: "string" },
        { name: "category", type: "choice" },
        { name: "resolution", type: "text" },
      ],
    },
    {
      key: "ticket_comment",
      name: "Ticket Comment",
      fields: [
        { name: "ticket_ref", type: "reference", required: true },
        { name: "author", type: "string", required: true },
        { name: "body", type: "text", required: true },
        { name: "is_internal", type: "boolean" },
      ],
    },
  ],
  slaPolicies: [
    { recordTypeKey: "ticket", durationMinutes: 480 }, // 8 hours
  ],
  assignmentRules: [
    {
      recordTypeKey: "ticket",
      strategyType: "static_group",
      config: { groupKey: "support_team" },
    },
  ],
  workflows: [
    {
      key: "ticket_intake",
      name: "Ticket Intake",
      recordTypeKey: "ticket",
      triggerEvent: "record_created",
      steps: [
        {
          name: "Set status to open",
          stepType: "record_mutation",
          config: { field: "status", value: "open" },
          ordering: 1,
        },
        {
          name: "Notify support team",
          stepType: "notification",
          config: { template: "ticket_opened", targetGroup: "support_team" },
          ordering: 2,
        },
      ],
    },
  ],
};

/**
 * Registry of all vibe templates, keyed by intent keywords.
 * Multiple keywords can map to the same template.
 */
export interface VibeTemplate {
  keywords: string[];
  template: GraphPackage;
  description: string;
}

export const vibeTemplateRegistry: VibeTemplate[] = [
  {
    keywords: ["onboarding", "onboard", "new hire", "new employee", "employee onboarding"],
    template: onboardingAppTemplate,
    description: "Employee onboarding workflow with request tracking and task management",
  },
  {
    keywords: ["pto", "time off", "vacation", "leave", "time-off", "paid time off"],
    template: ptoRequestAppTemplate,
    description: "PTO request and approval workflow with balance tracking",
  },
  {
    keywords: ["vendor", "supplier", "procurement", "vendor intake", "vendor onboarding"],
    template: vendorIntakeAppTemplate,
    description: "Vendor intake and review process with compliance tracking",
  },
  {
    keywords: ["ticket", "ticketing", "helpdesk", "help desk", "support", "service desk", "bug", "issue"],
    template: simpleTicketingAppTemplate,
    description: "Simple ticketing system with SLA tracking and team assignment",
  },
];
