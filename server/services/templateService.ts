import type { SystemContext } from "../tenant";
import { storage } from "../storage";
import type { Template, TemplateModule } from "@shared/schema";

export async function systemGetTemplates(_ctx: SystemContext): Promise<Template[]> {
  return storage.getTemplates();
}

export async function systemGetTemplate(_ctx: SystemContext, id: string): Promise<Template | undefined> {
  return storage.getTemplate(id);
}

export async function systemGetTemplateModules(_ctx: SystemContext, templateId: string): Promise<TemplateModule[]> {
  return storage.getTemplateModules(templateId);
}
