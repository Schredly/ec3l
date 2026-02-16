import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import type {
  RecordType,
  ChoiceList,
  FieldDefinition,
  FormDefinition,
  FormSection,
  WorkflowDefinition,
  WorkflowStep,
} from "@shared/schema";
import { seedDefaultRoles, PERMISSIONS } from "./rbacService";

export class HrLiteInstallError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "HrLiteInstallError";
    this.statusCode = statusCode;
  }
}

export interface HrLiteInstallResult {
  recordTypes: {
    employee: RecordType;
    jobChange: RecordType;
  };
  choiceLists: {
    employeeStatus: ChoiceList;
    changeType: ChoiceList;
    jobChangeStatus: ChoiceList;
  };
  fields: {
    employee: FieldDefinition[];
    jobChange: FieldDefinition[];
  };
  forms: {
    employeeDefault: FormDefinition;
    jobChangeDefault: FormDefinition;
  };
  rbac: {
    hrAdmin: string;
    manager: string;
    employee: string;
  };
  workflows: {
    hireEmployee: WorkflowDefinition;
    terminateEmployee: WorkflowDefinition;
  };
}

async function ensureChoiceList(
  ctx: TenantContext,
  name: string,
  items: { value: string; label: string }[],
): Promise<ChoiceList> {
  const existing = await storage.getChoiceListsByTenant(ctx.tenantId);
  let cl = existing.find((c) => c.name === name);
  if (!cl) {
    cl = await storage.createChoiceList({ name, tenantId: ctx.tenantId });
  }
  const existingItems = await storage.getChoiceItemsByList(cl.id);
  const existingValues = new Set(existingItems.map((i) => i.value));
  for (let i = 0; i < items.length; i++) {
    if (!existingValues.has(items[i].value)) {
      await storage.createChoiceItem({
        choiceListId: cl.id,
        value: items[i].value,
        label: items[i].label,
        orderIndex: i,
      });
    }
  }
  return cl;
}

async function ensureRecordType(
  ctx: TenantContext,
  name: string,
  description: string,
): Promise<RecordType> {
  let rt = await storage.getRecordTypeByTenantAndName(ctx.tenantId, name);
  if (!rt) {
    rt = await storage.createRecordType({
      tenantId: ctx.tenantId,
      name,
      description,
    });
  }
  if (rt.status !== "active") {
    rt = (await storage.updateRecordTypeStatus(rt.id, "active"))!;
  }
  return rt;
}

async function ensureField(
  recordTypeId: string,
  data: Omit<import("@shared/schema").InsertFieldDefinition, "recordTypeId">,
): Promise<FieldDefinition> {
  const existing = await storage.getFieldDefinitionsByRecordType(recordTypeId);
  const found = existing.find((f) => f.name === data.name);
  if (found) return found;
  return storage.createFieldDefinition({ ...data, recordTypeId });
}

async function ensureFormDefinition(
  ctx: TenantContext,
  recordTypeId: string,
  name: string,
): Promise<FormDefinition> {
  let fd = await storage.getFormDefinitionByTenantRecordAndName(
    ctx.tenantId,
    recordTypeId,
    name,
  );
  if (!fd) {
    fd = await storage.createFormDefinition({
      tenantId: ctx.tenantId,
      recordTypeId,
      name,
    });
  }
  if (fd.status !== "active") {
    fd = (await storage.updateFormDefinitionStatus(fd.id, "active"))!;
  }
  return fd;
}

async function ensureFormSection(
  formDefinitionId: string,
  title: string,
  orderIndex: number,
): Promise<FormSection> {
  const existing = await storage.getFormSectionsByDefinition(formDefinitionId);
  const found = existing.find((s) => s.title === title);
  if (found) return found;
  return storage.createFormSection({ formDefinitionId, title, orderIndex });
}

async function ensurePlacement(
  formSectionId: string,
  fieldDefinitionId: string,
  orderIndex: number,
  column: number = 1,
): Promise<void> {
  const existing = await storage.getFormFieldPlacementsBySection(formSectionId);
  const found = existing.find((p) => p.fieldDefinitionId === fieldDefinitionId);
  if (found) return;
  await storage.createFormFieldPlacement({
    formSectionId,
    fieldDefinitionId,
    column,
    orderIndex,
  });
}

// --- Step 8A-1: RecordTypes + FieldDefinitions ---

async function installRecordTypes(ctx: TenantContext) {
  const employeeStatusCl = await ensureChoiceList(ctx, "employee_status", [
    { value: "candidate", label: "Candidate" },
    { value: "active", label: "Active" },
    { value: "leave", label: "Leave" },
    { value: "terminated", label: "Terminated" },
  ]);

  const changeTypeCl = await ensureChoiceList(ctx, "job_change_type", [
    { value: "hire", label: "Hire" },
    { value: "promotion", label: "Promotion" },
    { value: "transfer", label: "Transfer" },
    { value: "termination", label: "Termination" },
  ]);

  const jobChangeStatusCl = await ensureChoiceList(ctx, "job_change_status", [
    { value: "draft", label: "Draft" },
    { value: "pendingApproval", label: "Pending Approval" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "applied", label: "Applied" },
  ]);

  const employeeRt = await ensureRecordType(
    ctx,
    "employee",
    "HR Lite employee record",
  );
  const jobChangeRt = await ensureRecordType(
    ctx,
    "job_change",
    "HR Lite job change record",
  );

  const employeeFields = await installEmployeeFields(
    employeeRt,
    employeeStatusCl,
  );
  const jobChangeFields = await installJobChangeFields(
    jobChangeRt,
    employeeRt,
    changeTypeCl,
    jobChangeStatusCl,
  );

  return {
    recordTypes: { employee: employeeRt, jobChange: jobChangeRt },
    choiceLists: {
      employeeStatus: employeeStatusCl,
      changeType: changeTypeCl,
      jobChangeStatus: jobChangeStatusCl,
    },
    fields: { employee: employeeFields, jobChange: jobChangeFields },
  };
}

async function installEmployeeFields(
  rt: RecordType,
  statusCl: ChoiceList,
): Promise<FieldDefinition[]> {
  const fields: FieldDefinition[] = [];

  fields.push(
    await ensureField(rt.id, {
      name: "employeeId",
      label: "Employee ID",
      fieldType: "string",
      isRequired: true,
      orderIndex: 0,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "firstName",
      label: "First Name",
      fieldType: "string",
      isRequired: true,
      orderIndex: 1,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "lastName",
      label: "Last Name",
      fieldType: "string",
      isRequired: true,
      orderIndex: 2,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "email",
      label: "Email",
      fieldType: "string",
      isRequired: true,
      orderIndex: 3,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "title",
      label: "Title",
      fieldType: "string",
      isRequired: false,
      orderIndex: 4,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "department",
      label: "Department",
      fieldType: "string",
      isRequired: false,
      orderIndex: 5,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "managerId",
      label: "Manager",
      fieldType: "reference",
      isRequired: false,
      referenceRecordTypeId: rt.id,
      orderIndex: 6,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "status",
      label: "Status",
      fieldType: "choice",
      isRequired: true,
      choiceListId: statusCl.id,
      orderIndex: 7,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "startDate",
      label: "Start Date",
      fieldType: "date",
      isRequired: false,
      orderIndex: 8,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "location",
      label: "Location",
      fieldType: "string",
      isRequired: false,
      orderIndex: 9,
    }),
  );

  return fields;
}

async function installJobChangeFields(
  rt: RecordType,
  employeeRt: RecordType,
  changeTypeCl: ChoiceList,
  statusCl: ChoiceList,
): Promise<FieldDefinition[]> {
  const fields: FieldDefinition[] = [];

  fields.push(
    await ensureField(rt.id, {
      name: "employeeId",
      label: "Employee",
      fieldType: "reference",
      isRequired: true,
      referenceRecordTypeId: employeeRt.id,
      orderIndex: 0,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "changeType",
      label: "Change Type",
      fieldType: "choice",
      isRequired: true,
      choiceListId: changeTypeCl.id,
      orderIndex: 1,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "effectiveDate",
      label: "Effective Date",
      fieldType: "date",
      isRequired: true,
      orderIndex: 2,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "proposedTitle",
      label: "Proposed Title",
      fieldType: "string",
      isRequired: false,
      orderIndex: 3,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "proposedDepartment",
      label: "Proposed Department",
      fieldType: "string",
      isRequired: false,
      orderIndex: 4,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "proposedManagerId",
      label: "Proposed Manager",
      fieldType: "reference",
      isRequired: false,
      referenceRecordTypeId: employeeRt.id,
      orderIndex: 5,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "reason",
      label: "Reason",
      fieldType: "text",
      isRequired: false,
      orderIndex: 6,
    }),
  );
  fields.push(
    await ensureField(rt.id, {
      name: "status",
      label: "Status",
      fieldType: "choice",
      isRequired: true,
      choiceListId: statusCl.id,
      orderIndex: 7,
    }),
  );

  return fields;
}

// --- Step 8A-2: Baseline Forms ---

async function installForms(
  ctx: TenantContext,
  recordTypes: { employee: RecordType; jobChange: RecordType },
  fields: { employee: FieldDefinition[]; jobChange: FieldDefinition[] },
) {
  const employeeForm = await installEmployeeForm(
    ctx,
    recordTypes.employee,
    fields.employee,
  );
  const jobChangeForm = await installJobChangeForm(
    ctx,
    recordTypes.jobChange,
    fields.jobChange,
  );
  return { employeeDefault: employeeForm, jobChangeDefault: jobChangeForm };
}

async function installEmployeeForm(
  ctx: TenantContext,
  rt: RecordType,
  fields: FieldDefinition[],
): Promise<FormDefinition> {
  const fd = await ensureFormDefinition(ctx, rt.id, "employee_default");

  const fieldByName = new Map(fields.map((f) => [f.name, f]));

  const identitySection = await ensureFormSection(fd.id, "Identity", 0);
  await ensurePlacement(identitySection.id, fieldByName.get("employeeId")!.id, 0);
  await ensurePlacement(identitySection.id, fieldByName.get("firstName")!.id, 1);
  await ensurePlacement(identitySection.id, fieldByName.get("lastName")!.id, 2);
  await ensurePlacement(identitySection.id, fieldByName.get("email")!.id, 3);

  const roleSection = await ensureFormSection(fd.id, "Role & Org", 1);
  await ensurePlacement(roleSection.id, fieldByName.get("title")!.id, 0);
  await ensurePlacement(roleSection.id, fieldByName.get("department")!.id, 1);
  await ensurePlacement(roleSection.id, fieldByName.get("managerId")!.id, 2);

  const detailsSection = await ensureFormSection(
    fd.id,
    "Employment Details",
    2,
  );
  await ensurePlacement(detailsSection.id, fieldByName.get("status")!.id, 0);
  await ensurePlacement(detailsSection.id, fieldByName.get("startDate")!.id, 1);
  await ensurePlacement(detailsSection.id, fieldByName.get("location")!.id, 2);

  return fd;
}

async function installJobChangeForm(
  ctx: TenantContext,
  rt: RecordType,
  fields: FieldDefinition[],
): Promise<FormDefinition> {
  const fd = await ensureFormDefinition(ctx, rt.id, "job_change_default");

  const fieldByName = new Map(fields.map((f) => [f.name, f]));

  const changeSection = await ensureFormSection(fd.id, "Change Details", 0);
  await ensurePlacement(changeSection.id, fieldByName.get("employeeId")!.id, 0);
  await ensurePlacement(changeSection.id, fieldByName.get("changeType")!.id, 1);
  await ensurePlacement(
    changeSection.id,
    fieldByName.get("effectiveDate")!.id,
    2,
  );

  const proposedSection = await ensureFormSection(
    fd.id,
    "Proposed Updates",
    1,
  );
  await ensurePlacement(
    proposedSection.id,
    fieldByName.get("proposedTitle")!.id,
    0,
  );
  await ensurePlacement(
    proposedSection.id,
    fieldByName.get("proposedDepartment")!.id,
    1,
  );
  await ensurePlacement(
    proposedSection.id,
    fieldByName.get("proposedManagerId")!.id,
    2,
  );

  const approvalSection = await ensureFormSection(
    fd.id,
    "Approval Status",
    2,
  );
  await ensurePlacement(
    approvalSection.id,
    fieldByName.get("status")!.id,
    0,
  );
  await ensurePlacement(approvalSection.id, fieldByName.get("reason")!.id, 1);

  return fd;
}

// --- Step 8A-3: RBAC Roles ---

async function installRbacRoles(
  ctx: TenantContext,
  recordTypes: { employee: RecordType; jobChange: RecordType },
) {
  await seedDefaultRoles(ctx.tenantId);

  const allPerms = await storage.getRbacPermissions();
  const permByName = new Map(allPerms.map((p) => [p.name, p]));

  const hrAdminPerms = [
    PERMISSIONS.FORM_VIEW,
    PERMISSIONS.FORM_EDIT,
    PERMISSIONS.WORKFLOW_EXECUTE,
    PERMISSIONS.WORKFLOW_APPROVE,
    PERMISSIONS.OVERRIDE_ACTIVATE,
    PERMISSIONS.CHANGE_APPROVE,
  ];

  const managerPerms = [
    PERMISSIONS.FORM_VIEW,
    PERMISSIONS.WORKFLOW_APPROVE,
  ];

  const employeePerms = [PERMISSIONS.FORM_VIEW];

  const hrAdminRole = await ensureRole(ctx, "HR Admin", "Full HR Lite access");
  const managerRole = await ensureRole(ctx, "Manager", "Can view forms and approve job changes");
  const employeeRole = await ensureRole(ctx, "Employee", "Can view own employee record");

  await assignPermissions(hrAdminRole.id, hrAdminPerms, permByName);
  await assignPermissions(managerRole.id, managerPerms, permByName);
  await assignPermissions(employeeRole.id, employeePerms, permByName);

  const existingPolicies = await storage.getRbacPoliciesByTenant(ctx.tenantId);

  const managerPolicyExists = existingPolicies.some(
    (p) =>
      p.roleId === managerRole.id &&
      p.resourceType === "workflow" &&
      p.effect === "allow",
  );
  if (!managerPolicyExists) {
    await storage.createRbacPolicy({
      tenantId: ctx.tenantId,
      roleId: managerRole.id,
      resourceType: "workflow",
      resourceId: null,
      effect: "allow",
    });
  }

  return {
    hrAdmin: hrAdminRole.id,
    manager: managerRole.id,
    employee: employeeRole.id,
  };
}

async function ensureRole(ctx: TenantContext, name: string, description: string) {
  let role = await storage.getRbacRoleByTenantAndName(ctx.tenantId, name);
  if (!role) {
    role = await storage.createRbacRole({
      tenantId: ctx.tenantId,
      name,
      description,
    });
  }
  if (role.status !== "active") {
    role = (await storage.updateRbacRoleStatus(role.id, "active"))!;
  }
  return role;
}

async function assignPermissions(
  roleId: string,
  permNames: string[],
  permByName: Map<string, { id: string; name: string }>,
) {
  const existing = await storage.getRbacRolePermissions(roleId);
  const existingPermIds = new Set(existing.map((rp) => rp.permissionId));
  for (const permName of permNames) {
    const perm = permByName.get(permName);
    if (perm && !existingPermIds.has(perm.id)) {
      await storage.addRbacRolePermission(roleId, perm.id);
    }
  }
}

// --- Step 8A-4 & 8A-5: Workflows ---

async function installWorkflows(
  ctx: TenantContext,
  recordTypes: { employee: RecordType; jobChange: RecordType },
  projectId: string,
) {
  const hireWf = await installHireWorkflow(ctx, recordTypes, projectId);
  const terminateWf = await installTerminateWorkflow(ctx, recordTypes, projectId);
  return { hireEmployee: hireWf, terminateEmployee: terminateWf };
}

async function ensureWorkflowDefinition(
  ctx: TenantContext,
  name: string,
  triggerType: "record_event" | "schedule" | "manual",
  triggerConfig: Record<string, unknown>,
  projectId: string,
): Promise<WorkflowDefinition> {
  const existing = await storage.getWorkflowDefinitionsByTenant(ctx.tenantId);
  let wf = existing.find((w) => w.name === name);
  if (!wf) {
    wf = await storage.createWorkflowDefinition({
      tenantId: ctx.tenantId,
      name,
      triggerType,
      triggerConfig,
    });
  }
  return wf;
}

async function ensureWorkflowStep(
  workflowDefinitionId: string,
  stepType: "assignment" | "approval" | "notification" | "decision",
  config: Record<string, unknown>,
  orderIndex: number,
): Promise<WorkflowStep> {
  const existing = await storage.getWorkflowStepsByDefinition(workflowDefinitionId);
  const found = existing.find((s) => s.orderIndex === orderIndex);
  if (found) return found;
  return storage.createWorkflowStep({
    workflowDefinitionId,
    stepType,
    config,
    orderIndex,
  });
}

async function installHireWorkflow(
  ctx: TenantContext,
  recordTypes: { employee: RecordType; jobChange: RecordType },
  projectId: string,
): Promise<WorkflowDefinition> {
  const wf = await ensureWorkflowDefinition(ctx, "hire_employee", "record_event", {
    recordType: "job_change",
    event: "create",
    condition: { field: "changeType", operator: "equals", value: "hire" },
  }, projectId);

  await ensureWorkflowStep(wf.id, "decision", {
    conditionField: "changeType",
    conditionOperator: "equals",
    conditionValue: "hire",
    onTrueStepIndex: 1,
    onFalseStepIndex: 5,
    description: "Validate required fields and change type is hire",
  }, 0);

  await ensureWorkflowStep(wf.id, "approval", {
    approver: "role:HR Admin",
    autoApprove: false,
    description: "HR Admin approval required for hire",
  }, 1);

  await ensureWorkflowStep(wf.id, "approval", {
    approver: "role:Manager",
    autoApprove: false,
    description: "Manager approval required for hire",
  }, 2);

  await ensureWorkflowStep(wf.id, "assignment", {
    assigneeType: "system",
    assignee: "record_mutation",
    taskTitle: "Update employee record: status=active, apply proposed fields",
    mutation: {
      targetRecordType: "employee",
      targetField: "employeeId",
      updates: {
        status: "active",
        title: { fromField: "proposedTitle" },
        department: { fromField: "proposedDepartment" },
        managerId: { fromField: "proposedManagerId" },
      },
    },
  }, 3);

  await ensureWorkflowStep(wf.id, "assignment", {
    assigneeType: "system",
    assignee: "record_mutation",
    taskTitle: "Update job_change status to applied",
    mutation: {
      targetRecordType: "job_change",
      updates: { status: "applied" },
    },
  }, 4);

  await ensureWorkflowStep(wf.id, "notification", {
    channel: "system",
    recipient: "initiator",
    template: "workflow_skipped",
    message: "Job change is not a hire — workflow skipped",
  }, 5);

  if (wf.status !== "active") {
    await storage.updateWorkflowDefinitionStatus(wf.id, "active");
  }

  const trigger = await ensureTrigger(ctx, wf.id, "record_event", {
    recordType: "job_change",
    event: "create",
    condition: { field: "changeType", operator: "equals", value: "hire" },
  });

  return wf;
}

async function installTerminateWorkflow(
  ctx: TenantContext,
  recordTypes: { employee: RecordType; jobChange: RecordType },
  projectId: string,
): Promise<WorkflowDefinition> {
  const wf = await ensureWorkflowDefinition(ctx, "terminate_employee", "record_event", {
    recordType: "job_change",
    event: "create",
    condition: { field: "changeType", operator: "equals", value: "termination" },
  }, projectId);

  await ensureWorkflowStep(wf.id, "approval", {
    approver: "role:HR Admin",
    autoApprove: false,
    description: "HR Admin approval required for termination",
  }, 0);

  await ensureWorkflowStep(wf.id, "approval", {
    approver: "role:Manager",
    autoApprove: false,
    description: "Manager approval required for termination",
  }, 1);

  await ensureWorkflowStep(wf.id, "assignment", {
    assigneeType: "system",
    assignee: "record_mutation",
    taskTitle: "Update employee status to terminated",
    mutation: {
      targetRecordType: "employee",
      targetField: "employeeId",
      updates: { status: "terminated" },
    },
  }, 2);

  await ensureWorkflowStep(wf.id, "assignment", {
    assigneeType: "system",
    assignee: "record_lock",
    taskTitle: "Lock employee record (readOnly)",
    lock: {
      targetRecordType: "employee",
      targetField: "employeeId",
      readOnly: true,
    },
  }, 3);

  await ensureWorkflowStep(wf.id, "assignment", {
    assigneeType: "system",
    assignee: "record_mutation",
    taskTitle: "Update job_change status to applied",
    mutation: {
      targetRecordType: "job_change",
      updates: { status: "applied" },
    },
  }, 4);

  if (wf.status !== "active") {
    await storage.updateWorkflowDefinitionStatus(wf.id, "active");
  }

  await ensureTrigger(ctx, wf.id, "record_event", {
    recordType: "job_change",
    event: "create",
    condition: { field: "changeType", operator: "equals", value: "termination" },
  });

  return wf;
}

async function ensureTrigger(
  ctx: TenantContext,
  workflowDefinitionId: string,
  triggerType: "record_event" | "schedule" | "manual",
  triggerConfig: Record<string, unknown>,
) {
  const existing = await storage.getWorkflowTriggersByDefinition(workflowDefinitionId);
  const found = existing.find(
    (t) => t.triggerType === triggerType && t.status === "active",
  );
  if (found) return found;
  return storage.createWorkflowTrigger({
    tenantId: ctx.tenantId,
    workflowDefinitionId,
    triggerType,
    triggerConfig,
  });
}

// --- Step 8A-6: Agent Assist (metadata only, no direct mutation) ---

export const AGENT_CONSTRAINTS = {
  allowedActions: [
    "propose_form_patch",
    "suggest_workflow_change",
    "draft_approval_comment",
  ],
  prohibitedActions: [
    "override_activate",
    "record_mutate",
    "workflow_execute",
    "role_assign",
  ],
  requiresHumanApproval: true,
  description:
    "Agents can assist HR Lite by proposing changes (form patches, workflow suggestions, approval comments) but cannot directly mutate records, activate overrides, or execute workflows. All agent proposals require human approval before taking effect.",
} as const;

// --- Main Install Function ---

export async function installHrLite(ctx: TenantContext): Promise<HrLiteInstallResult> {
  const existingRts = await storage.getRecordTypesByTenant(ctx.tenantId);
  const hasEmployee = existingRts.some((rt) => rt.name === "employee");
  const hasJobChange = existingRts.some((rt) => rt.name === "job_change");

  const { recordTypes, choiceLists, fields } = await installRecordTypes(ctx);
  const forms = await installForms(ctx, recordTypes, fields);

  const rbac = await installRbacRoles(ctx, recordTypes);

  const projects = await storage.getProjectsByTenant(ctx.tenantId);
  let projectId: string;
  if (projects.length > 0) {
    projectId = projects[0].id;
  } else {
    const project = await storage.createProject({
      name: "HR Lite",
      githubRepo: "internal/hr-lite",
      defaultBranch: "main",
      description: "HR Lite application module",
      tenantId: ctx.tenantId,
    });
    projectId = project.id;
  }

  const workflows = await installWorkflows(ctx, recordTypes, projectId);

  return {
    recordTypes,
    choiceLists,
    fields,
    forms,
    rbac,
    workflows,
  };
}
