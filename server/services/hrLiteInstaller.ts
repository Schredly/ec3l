import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import type {
  RecordType,
  ChoiceList,
  FieldDefinition,
  FormDefinition,
  FormSection,
  FormFieldPlacement,
} from "@shared/schema";

export class HrLiteInstallError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "HrLiteInstallError";
    this.statusCode = statusCode;
  }
}

export interface HrLiteFormResult {
  id: string;
  name: string;
  sectionCount: number;
  fieldCount: number;
}

export interface HrLiteInstallResult {
  module: { id: string; name: string; type: string; version: string };
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
    employeeDefault: HrLiteFormResult;
    jobChangeDefault: HrLiteFormResult;
  };
}

const HR_LITE_MODULE_NAME = "hr_lite";
const HR_LITE_VERSION = "1.0.0";

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

async function ensureProject(ctx: TenantContext): Promise<string> {
  const projects = await storage.getProjectsByTenant(ctx.tenantId);
  if (projects.length > 0) return projects[0].id;
  const project = await storage.createProject({
    name: "HR Lite",
    githubRepo: "internal/hr-lite",
    defaultBranch: "main",
    description: "HR Lite application module",
    tenantId: ctx.tenantId,
  });
  return project.id;
}

async function ensureModule(
  projectId: string,
): Promise<{ id: string; name: string; type: string; version: string }> {
  const allModules = await storage.getModulesByProject(projectId);
  const found = allModules.find(
    (m) => m.name === HR_LITE_MODULE_NAME && m.type === "application",
  );
  if (found) {
    return {
      id: found.id,
      name: found.name,
      type: found.type,
      version: HR_LITE_VERSION,
    };
  }
  const mod = await storage.createModule({
    projectId,
    name: HR_LITE_MODULE_NAME,
    type: "application",
    rootPath: "src/hr-lite",
    version: HR_LITE_VERSION,
  });
  return {
    id: mod.id,
    name: mod.name,
    type: mod.type,
    version: HR_LITE_VERSION,
  };
}

async function ensureFormDefinition(
  ctx: TenantContext,
  recordTypeId: string,
  name: string,
): Promise<FormDefinition> {
  const existing = await storage.getFormDefinitionByTenantRecordAndName(
    ctx.tenantId,
    recordTypeId,
    name,
  );
  if (existing) return existing;
  const fd = await storage.createFormDefinition({
    tenantId: ctx.tenantId,
    recordTypeId,
    name,
  });
  return fd;
}

async function ensureFormSection(
  formDefinitionId: string,
  title: string,
  orderIndex: number,
  existingSections: FormSection[],
): Promise<FormSection> {
  const found = existingSections.find(
    (s) => s.title === title && s.formDefinitionId === formDefinitionId,
  );
  if (found) return found;
  return storage.createFormSection({ formDefinitionId, title, orderIndex });
}

async function ensureFormFieldPlacement(
  formSectionId: string,
  fieldDefinitionId: string,
  orderIndex: number,
  column: number,
  existingPlacements: FormFieldPlacement[],
): Promise<FormFieldPlacement> {
  const found = existingPlacements.find(
    (p) =>
      p.formSectionId === formSectionId &&
      p.fieldDefinitionId === fieldDefinitionId,
  );
  if (found) return found;
  return storage.createFormFieldPlacement({
    formSectionId,
    fieldDefinitionId,
    orderIndex,
    column,
  });
}

interface FormFieldSpec {
  fieldName: string;
  orderIndex: number;
  column?: number;
}

interface FormSectionSpec {
  title: string;
  orderIndex: number;
  fields: FormFieldSpec[];
}

async function installForm(
  ctx: TenantContext,
  recordType: RecordType,
  formName: string,
  sectionSpecs: FormSectionSpec[],
  fieldDefs: FieldDefinition[],
): Promise<HrLiteFormResult> {
  const fd = await ensureFormDefinition(ctx, recordType.id, formName);

  if (fd.status !== "active") {
    await storage.updateFormDefinitionStatus(fd.id, "active");
  }

  const existingSections = await storage.getFormSectionsByDefinition(fd.id);
  let totalFieldCount = 0;

  for (const spec of sectionSpecs) {
    const section = await ensureFormSection(
      fd.id,
      spec.title,
      spec.orderIndex,
      existingSections,
    );

    const existingPlacements =
      await storage.getFormFieldPlacementsBySection(section.id);

    for (const fieldSpec of spec.fields) {
      const fieldDef = fieldDefs.find((f) => f.name === fieldSpec.fieldName);
      if (!fieldDef) {
        throw new HrLiteInstallError(
          `Field "${fieldSpec.fieldName}" not found on record type "${recordType.name}"`,
        );
      }
      await ensureFormFieldPlacement(
        section.id,
        fieldDef.id,
        fieldSpec.orderIndex,
        fieldSpec.column ?? 1,
        existingPlacements,
      );
      totalFieldCount++;
    }
  }

  return {
    id: fd.id,
    name: fd.name,
    sectionCount: sectionSpecs.length,
    fieldCount: totalFieldCount,
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

export async function installHrLite(ctx: TenantContext): Promise<HrLiteInstallResult> {
  const projectId = await ensureProject(ctx);
  const module = await ensureModule(projectId);

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

  const employeeFields = await installEmployeeFields(employeeRt, employeeStatusCl);
  const jobChangeFields = await installJobChangeFields(
    jobChangeRt,
    employeeRt,
    changeTypeCl,
    jobChangeStatusCl,
  );

  const employeeForm = await installForm(ctx, employeeRt, "employee_default", [
    {
      title: "Identity",
      orderIndex: 0,
      fields: [
        { fieldName: "employeeId", orderIndex: 0 },
        { fieldName: "firstName", orderIndex: 1 },
        { fieldName: "lastName", orderIndex: 2 },
        { fieldName: "email", orderIndex: 3 },
      ],
    },
    {
      title: "Role & Org",
      orderIndex: 1,
      fields: [
        { fieldName: "title", orderIndex: 0 },
        { fieldName: "department", orderIndex: 1 },
        { fieldName: "managerId", orderIndex: 2 },
      ],
    },
    {
      title: "Employment Details",
      orderIndex: 2,
      fields: [
        { fieldName: "status", orderIndex: 0 },
        { fieldName: "startDate", orderIndex: 1 },
        { fieldName: "location", orderIndex: 2 },
      ],
    },
  ], employeeFields);

  const jobChangeForm = await installForm(ctx, jobChangeRt, "job_change_default", [
    {
      title: "Change Details",
      orderIndex: 0,
      fields: [
        { fieldName: "employeeId", orderIndex: 0 },
        { fieldName: "changeType", orderIndex: 1 },
        { fieldName: "effectiveDate", orderIndex: 2 },
      ],
    },
    {
      title: "Proposed Updates",
      orderIndex: 1,
      fields: [
        { fieldName: "proposedTitle", orderIndex: 0 },
        { fieldName: "proposedDepartment", orderIndex: 1 },
        { fieldName: "proposedManagerId", orderIndex: 2 },
      ],
    },
    {
      title: "Approval Status",
      orderIndex: 2,
      fields: [
        { fieldName: "status", orderIndex: 0 },
        { fieldName: "reason", orderIndex: 1 },
      ],
    },
  ], jobChangeFields);

  return {
    module,
    recordTypes: { employee: employeeRt, jobChange: jobChangeRt },
    choiceLists: {
      employeeStatus: employeeStatusCl,
      changeType: changeTypeCl,
      jobChangeStatus: jobChangeStatusCl,
    },
    fields: { employee: employeeFields, jobChange: jobChangeFields },
    forms: {
      employeeDefault: employeeForm,
      jobChangeDefault: jobChangeForm,
    },
  };
}
