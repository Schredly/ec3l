import type { TenantContext } from "../tenant";
import { storage } from "../storage";
import type {
  RecordType,
  InsertRecordType,
  FieldDefinition,
  InsertFieldDefinition,
  ChoiceList,
  InsertChoiceList,
  ChoiceItem,
  InsertChoiceItem,
  FormDefinition,
  InsertFormDefinition,
  FormSection,
  InsertFormSection,
  FormFieldPlacement,
  InsertFormFieldPlacement,
  FormBehaviorRule,
  InsertFormBehaviorRule,
  ModuleOverride,
} from "@shared/schema";

export class FormServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "FormServiceError";
    this.statusCode = statusCode;
  }
}

// --- RecordType ---

export async function getRecordTypesByTenant(ctx: TenantContext): Promise<RecordType[]> {
  return storage.getRecordTypesByTenant(ctx.tenantId);
}

export async function getRecordType(ctx: TenantContext, id: string): Promise<RecordType | undefined> {
  const rt = await storage.getRecordType(id);
  if (rt && rt.tenantId !== ctx.tenantId) {
    throw new FormServiceError("Record type does not belong to this tenant", 403);
  }
  return rt;
}

export async function createRecordType(ctx: TenantContext, data: Omit<InsertRecordType, "tenantId">): Promise<RecordType> {
  return storage.createRecordType({ ...data, tenantId: ctx.tenantId });
}

export async function updateRecordTypeStatus(ctx: TenantContext, id: string, status: RecordType["status"]): Promise<RecordType> {
  const rt = await storage.getRecordType(id);
  if (!rt) throw new FormServiceError("Record type not found", 404);
  if (rt.tenantId !== ctx.tenantId) throw new FormServiceError("Record type does not belong to this tenant", 403);
  const updated = await storage.updateRecordTypeStatus(id, status);
  return updated!;
}

// --- FieldDefinition ---

export async function getFieldDefinitionsByRecordType(ctx: TenantContext, recordTypeId: string): Promise<FieldDefinition[]> {
  const rt = await storage.getRecordType(recordTypeId);
  if (!rt) throw new FormServiceError("Record type not found", 404);
  if (rt.tenantId !== ctx.tenantId) throw new FormServiceError("Record type does not belong to this tenant", 403);
  return storage.getFieldDefinitionsByRecordType(recordTypeId);
}

export async function createFieldDefinition(ctx: TenantContext, data: InsertFieldDefinition): Promise<FieldDefinition> {
  const rt = await storage.getRecordType(data.recordTypeId);
  if (!rt) throw new FormServiceError("Record type not found", 404);
  if (rt.tenantId !== ctx.tenantId) throw new FormServiceError("Record type does not belong to this tenant", 403);

  if (data.fieldType === "choice" && !data.choiceListId) {
    throw new FormServiceError("Choice fields require a choiceListId");
  }
  if (data.fieldType === "reference" && !data.referenceRecordTypeId) {
    throw new FormServiceError("Reference fields require a referenceRecordTypeId");
  }

  return storage.createFieldDefinition(data);
}

// --- ChoiceList ---

export async function getChoiceListsByTenant(ctx: TenantContext): Promise<ChoiceList[]> {
  return storage.getChoiceListsByTenant(ctx.tenantId);
}

export async function getChoiceList(ctx: TenantContext, id: string): Promise<ChoiceList | undefined> {
  const cl = await storage.getChoiceList(id);
  if (cl && cl.tenantId !== ctx.tenantId) {
    throw new FormServiceError("Choice list does not belong to this tenant", 403);
  }
  return cl;
}

export async function createChoiceList(ctx: TenantContext, data: Omit<InsertChoiceList, "tenantId">): Promise<ChoiceList> {
  return storage.createChoiceList({ ...data, tenantId: ctx.tenantId });
}

// --- ChoiceItem ---

export async function getChoiceItemsByList(ctx: TenantContext, choiceListId: string): Promise<ChoiceItem[]> {
  const cl = await storage.getChoiceList(choiceListId);
  if (!cl) throw new FormServiceError("Choice list not found", 404);
  if (cl.tenantId !== ctx.tenantId) throw new FormServiceError("Choice list does not belong to this tenant", 403);
  return storage.getChoiceItemsByList(choiceListId);
}

export async function createChoiceItem(ctx: TenantContext, data: InsertChoiceItem): Promise<ChoiceItem> {
  const cl = await storage.getChoiceList(data.choiceListId);
  if (!cl) throw new FormServiceError("Choice list not found", 404);
  if (cl.tenantId !== ctx.tenantId) throw new FormServiceError("Choice list does not belong to this tenant", 403);
  return storage.createChoiceItem(data);
}

// --- FormDefinition ---

export async function getFormDefinitionsByTenant(ctx: TenantContext): Promise<FormDefinition[]> {
  return storage.getFormDefinitionsByTenant(ctx.tenantId);
}

export async function getFormDefinition(ctx: TenantContext, id: string): Promise<FormDefinition | undefined> {
  const fd = await storage.getFormDefinition(id);
  if (fd && fd.tenantId !== ctx.tenantId) {
    throw new FormServiceError("Form definition does not belong to this tenant", 403);
  }
  return fd;
}

export async function createFormDefinition(ctx: TenantContext, data: Omit<InsertFormDefinition, "tenantId">): Promise<FormDefinition> {
  const rt = await storage.getRecordType(data.recordTypeId);
  if (!rt) throw new FormServiceError("Record type not found", 404);
  if (rt.tenantId !== ctx.tenantId) throw new FormServiceError("Record type does not belong to this tenant", 403);
  if (rt.status !== "active") throw new FormServiceError("Record type must be active to create forms", 400);
  return storage.createFormDefinition({ ...data, tenantId: ctx.tenantId });
}

export async function updateFormDefinitionStatus(ctx: TenantContext, id: string, status: FormDefinition["status"]): Promise<FormDefinition> {
  const fd = await storage.getFormDefinition(id);
  if (!fd) throw new FormServiceError("Form definition not found", 404);
  if (fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form definition does not belong to this tenant", 403);
  const updated = await storage.updateFormDefinitionStatus(id, status);
  return updated!;
}

// --- FormSection ---

export async function getFormSectionsByDefinition(ctx: TenantContext, formDefinitionId: string): Promise<FormSection[]> {
  const fd = await storage.getFormDefinition(formDefinitionId);
  if (!fd) throw new FormServiceError("Form definition not found", 404);
  if (fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form definition does not belong to this tenant", 403);
  return storage.getFormSectionsByDefinition(formDefinitionId);
}

export async function createFormSection(ctx: TenantContext, data: InsertFormSection): Promise<FormSection> {
  const fd = await storage.getFormDefinition(data.formDefinitionId);
  if (!fd) throw new FormServiceError("Form definition not found", 404);
  if (fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form definition does not belong to this tenant", 403);
  return storage.createFormSection(data);
}

// --- FormFieldPlacement ---

export async function getFormFieldPlacementsBySection(ctx: TenantContext, formSectionId: string): Promise<FormFieldPlacement[]> {
  const section = await storage.getFormSection(formSectionId);
  if (!section) throw new FormServiceError("Form section not found", 404);
  const fd = await storage.getFormDefinition(section.formDefinitionId);
  if (!fd || fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form does not belong to this tenant", 403);
  return storage.getFormFieldPlacementsBySection(formSectionId);
}

export async function createFormFieldPlacement(ctx: TenantContext, data: InsertFormFieldPlacement): Promise<FormFieldPlacement> {
  const section = await storage.getFormSection(data.formSectionId);
  if (!section) throw new FormServiceError("Form section not found", 404);
  const fd = await storage.getFormDefinition(section.formDefinitionId);
  if (!fd || fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form does not belong to this tenant", 403);

  const field = await storage.getFieldDefinition(data.fieldDefinitionId);
  if (!field) throw new FormServiceError("Field definition not found", 404);

  if (data.column !== 1 && data.column !== 2) {
    throw new FormServiceError("Column must be 1 or 2");
  }

  return storage.createFormFieldPlacement(data);
}

// --- FormBehaviorRule ---

export async function getFormBehaviorRulesByDefinition(ctx: TenantContext, formDefinitionId: string): Promise<FormBehaviorRule[]> {
  const fd = await storage.getFormDefinition(formDefinitionId);
  if (!fd) throw new FormServiceError("Form definition not found", 404);
  if (fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form definition does not belong to this tenant", 403);
  return storage.getFormBehaviorRulesByDefinition(formDefinitionId);
}

export async function createFormBehaviorRule(ctx: TenantContext, data: InsertFormBehaviorRule): Promise<FormBehaviorRule> {
  const fd = await storage.getFormDefinition(data.formDefinitionId);
  if (!fd) throw new FormServiceError("Form definition not found", 404);
  if (fd.tenantId !== ctx.tenantId) throw new FormServiceError("Form definition does not belong to this tenant", 403);

  const field = await storage.getFieldDefinition(data.targetFieldDefinitionId);
  if (!field) throw new FormServiceError("Target field definition not found", 404);

  return storage.createFormBehaviorRule(data);
}

// --- Form Compilation ---

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function applyFormOverridePatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const srcVal = patch[key];
    const tgtVal = result[key];
    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = applyFormOverridePatch(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export type CompiledField = {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue: unknown;
  choices?: { value: string; label: string }[];
  referenceRecordTypeId?: string | null;
};

export type CompiledPlacement = {
  fieldDefinitionId: string;
  column: number;
  orderIndex: number;
  field: CompiledField;
};

export type CompiledSection = {
  id: string;
  title: string;
  orderIndex: number;
  placements: CompiledPlacement[];
};

export type CompiledBehaviorRule = {
  id: string;
  ruleType: string;
  targetFieldDefinitionId: string;
  condition: unknown;
  value: boolean;
  orderIndex: number;
};

export type CompiledForm = {
  recordType: {
    id: string;
    name: string;
    description: string | null;
    version: number;
  };
  formDefinition: {
    id: string;
    name: string;
    version: number;
    status: string;
  };
  sections: CompiledSection[];
  behaviorRules: CompiledBehaviorRule[];
  fields: Record<string, CompiledField>;
  overridesApplied: number;
};

export async function compileForm(
  ctx: TenantContext,
  recordTypeName: string,
  formName: string,
): Promise<CompiledForm> {
  const recordType = await storage.getRecordTypeByTenantAndName(ctx.tenantId, recordTypeName);
  if (!recordType) throw new FormServiceError(`Record type "${recordTypeName}" not found`, 404);
  if (recordType.status !== "active") throw new FormServiceError(`Record type "${recordTypeName}" is not active`, 400);

  const formDef = await storage.getFormDefinitionByTenantRecordAndName(ctx.tenantId, recordType.id, formName);
  if (!formDef) throw new FormServiceError(`Form "${formName}" not found for record type "${recordTypeName}"`, 404);
  if (formDef.status !== "active") throw new FormServiceError(`Form "${formName}" is not active`, 400);

  const fieldDefs = await storage.getFieldDefinitionsByRecordType(recordType.id);
  const sections = await storage.getFormSectionsByDefinition(formDef.id);
  const behaviorRules = await storage.getActiveFormBehaviorRulesByDefinition(formDef.id);

  const fieldMap = new Map<string, FieldDefinition>();
  for (const f of fieldDefs) {
    fieldMap.set(f.id, f);
  }

  const choiceCache = new Map<string, { value: string; label: string }[]>();
  for (const f of fieldDefs) {
    if (f.fieldType === "choice" && f.choiceListId) {
      if (!choiceCache.has(f.choiceListId)) {
        const items = await storage.getChoiceItemsByList(f.choiceListId);
        choiceCache.set(
          f.choiceListId,
          items.filter(i => i.isActive).map(i => ({ value: i.value, label: i.label })),
        );
      }
    }
  }

  function buildCompiledField(fd: FieldDefinition): CompiledField {
    const cf: CompiledField = {
      id: fd.id,
      name: fd.name,
      label: fd.label,
      fieldType: fd.fieldType,
      isRequired: fd.isRequired,
      defaultValue: fd.defaultValue,
    };
    if (fd.fieldType === "choice" && fd.choiceListId) {
      cf.choices = choiceCache.get(fd.choiceListId) ?? [];
    }
    if (fd.fieldType === "reference") {
      cf.referenceRecordTypeId = fd.referenceRecordTypeId;
    }
    return cf;
  }

  const compiledSections: CompiledSection[] = [];
  for (const section of sections) {
    const placements = await storage.getFormFieldPlacementsBySection(section.id);
    const compiledPlacements: CompiledPlacement[] = [];
    for (const p of placements) {
      const fd = fieldMap.get(p.fieldDefinitionId);
      if (!fd) continue;
      compiledPlacements.push({
        fieldDefinitionId: p.fieldDefinitionId,
        column: p.column,
        orderIndex: p.orderIndex,
        field: buildCompiledField(fd),
      });
    }
    compiledSections.push({
      id: section.id,
      title: section.title,
      orderIndex: section.orderIndex,
      placements: compiledPlacements,
    });
  }

  const compiledRules: CompiledBehaviorRule[] = behaviorRules.map(r => ({
    id: r.id,
    ruleType: r.ruleType,
    targetFieldDefinitionId: r.targetFieldDefinitionId,
    condition: r.condition,
    value: r.value,
    orderIndex: r.orderIndex,
  }));

  const fieldsIndex: Record<string, CompiledField> = {};
  for (const fd of fieldDefs) {
    fieldsIndex[fd.id] = buildCompiledField(fd);
  }

  let compiled: Record<string, unknown> = {
    recordType: {
      id: recordType.id,
      name: recordType.name,
      description: recordType.description,
      version: recordType.version,
    },
    formDefinition: {
      id: formDef.id,
      name: formDef.name,
      version: formDef.version,
      status: formDef.status,
    },
    sections: compiledSections,
    behaviorRules: compiledRules,
    fields: fieldsIndex,
    overridesApplied: 0,
  };

  const formOverrides = await storage.getModuleOverridesByTenant(ctx.tenantId);
  const activeFormOverrides = formOverrides
    .filter((o: ModuleOverride) => o.overrideType === "form" && o.status === "active")
    .filter((o: ModuleOverride) => {
      const ref = o.targetRef;
      return ref === `${recordTypeName}:${formName}` || ref === `${recordType.id}:${formDef.id}`;
    })
    .sort((a: ModuleOverride, b: ModuleOverride) => a.version - b.version);

  for (const override of activeFormOverrides) {
    const patch = override.patch;
    if (patch && isPlainObject(patch)) {
      compiled = applyFormOverridePatch(compiled, patch);
    }
  }

  compiled.overridesApplied = activeFormOverrides.length;

  return compiled as unknown as CompiledForm;
}
