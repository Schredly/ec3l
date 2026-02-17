import type { TenantContext } from "../tenant";
import { getTenantStorage } from "../tenantStorage";
import type { RecordType } from "@shared/schema";

export class RecordTypeServiceError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RecordTypeServiceError";
    this.statusCode = statusCode;
  }
}

const ALLOWED_FIELD_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "reference",
  "choice",
  "text",
  "date",
  "datetime",
]);

function validateSchema(schema: unknown): void {
  if (schema === null || schema === undefined) return;
  if (typeof schema !== "object" || Array.isArray(schema)) {
    throw new RecordTypeServiceError("schema must be a JSON object");
  }
  const s = schema as Record<string, unknown>;
  if (s.fields !== undefined) {
    if (!Array.isArray(s.fields)) {
      throw new RecordTypeServiceError("schema.fields must be an array");
    }
    for (const field of s.fields) {
      if (typeof field !== "object" || field === null || Array.isArray(field)) {
        throw new RecordTypeServiceError("Each entry in schema.fields must be an object");
      }
      const f = field as Record<string, unknown>;
      if (!f.name || typeof f.name !== "string") {
        throw new RecordTypeServiceError("Each field in schema.fields requires a string \"name\"");
      }
      if (!f.type || typeof f.type !== "string") {
        throw new RecordTypeServiceError("Each field in schema.fields requires a string \"type\"");
      }
      if (!ALLOWED_FIELD_TYPES.has(f.type)) {
        throw new RecordTypeServiceError(
          `Invalid field type "${f.type}" — allowed types: ${Array.from(ALLOWED_FIELD_TYPES).join(", ")}`,
        );
      }
    }
  }
}

export async function createRecordType(
  ctx: TenantContext,
  data: {
    projectId: string;
    key: string;
    name: string;
    description?: string | null;
    baseType?: string | null;
    schema?: Record<string, unknown> | null;
  },
): Promise<RecordType> {
  const ts = getTenantStorage(ctx);

  if (!data.key || typeof data.key !== "string" || data.key.trim() === "") {
    throw new RecordTypeServiceError("key is required");
  }

  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    throw new RecordTypeServiceError("name is required");
  }

  const project = await ts.getProject(data.projectId);
  if (!project) {
    throw new RecordTypeServiceError("Project not found", 404);
  }

  const existing = await ts.getRecordTypeByKey(data.key);
  if (existing) {
    throw new RecordTypeServiceError(`Record type with key "${data.key}" already exists`, 409);
  }

  if (data.baseType) {
    const base = await ts.getRecordTypeByKey(data.baseType);
    if (!base) {
      throw new RecordTypeServiceError(
        `Base type "${data.baseType}" not found — it must exist before referencing it`,
        400,
      );
    }
  }

  validateSchema(data.schema);

  return ts.createRecordType({
    tenantId: ctx.tenantId,
    projectId: data.projectId,
    key: data.key,
    name: data.name,
    description: data.description ?? null,
    baseType: data.baseType ?? null,
    schema: data.schema ?? { fields: [] },
  });
}

export async function getRecordType(
  ctx: TenantContext,
  key: string,
): Promise<RecordType | undefined> {
  const ts = getTenantStorage(ctx);
  return ts.getRecordTypeByKey(key);
}

export async function listRecordTypes(
  ctx: TenantContext,
): Promise<RecordType[]> {
  const ts = getTenantStorage(ctx);
  return ts.listRecordTypes();
}
