import { apiRequest } from "../queryClient";

export interface VibeDraft {
  id: string;
  tenantId: string;
  projectId: string;
  environmentId: string | null;
  status: "draft" | "previewed" | "installed" | "discarded";
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  package: GraphPackageJson;
  checksum: string;
  lastPreviewDiff: GraphDiffResult | null;
  lastPreviewErrors: GraphValidationError[] | null;
}

export interface GraphPackageJson {
  packageKey: string;
  version: string;
  recordTypes: Array<{
    key: string;
    name?: string;
    baseType?: string;
    fields: Array<{ name: string; type: string; required?: boolean }>;
  }>;
  slaPolicies?: Array<{ recordTypeKey: string; durationMinutes: number }>;
  assignmentRules?: Array<{ recordTypeKey: string; strategyType: string; config?: Record<string, unknown> }>;
  workflows?: Array<{
    key: string;
    name: string;
    recordTypeKey: string;
    triggerEvent?: string;
    steps?: Array<{ name: string; stepType: string; config?: Record<string, unknown>; ordering: number }>;
  }>;
}

export interface GraphDiffResult {
  addedRecordTypes: Array<{ key: string; fieldCount: number }>;
  removedRecordTypes: Array<{ key: string }>;
  modifiedRecordTypes: Array<{
    key: string;
    addedFields: string[];
    removedFields: string[];
    baseTypeChanged?: boolean;
  }>;
}

export interface GraphValidationError {
  code: string;
  message: string;
  recordTypeId?: string | null;
  baseTypeKey?: string | null;
  details?: Record<string, unknown>;
}

export interface BuilderProposal {
  appName: string;
  recordTypes: string[];
  roles: string[];
  workflows: string[];
  approvals: string[];
  notifications: string[];
}

export async function fetchProposal(prompt: string): Promise<BuilderProposal> {
  const res = await apiRequest("GET", `/api/vibe/proposal?prompt=${encodeURIComponent(prompt)}`);
  return res.json();
}

export interface BuilderDraftResult {
  appId: string;
  environment: string;
}

export async function createBuilderDraft(prompt: string): Promise<BuilderDraftResult> {
  const res = await apiRequest("POST", "/api/builder/drafts", { prompt });
  return res.json();
}

export async function fetchBuilderDraft(appId: string): Promise<VibeDraft> {
  const res = await apiRequest("GET", `/api/builder/drafts/${appId}`);
  return res.json();
}

export async function refineBuilderDraft(appId: string, prompt: string): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/builder/drafts/${appId}/refine`, { prompt });
  return res.json();
}

export async function fetchBuilderDraftVersions(appId: string): Promise<DraftVersion[]> {
  const res = await apiRequest("GET", `/api/builder/drafts/${appId}/versions`);
  return res.json();
}

export async function fetchBuilderDraftVersion(appId: string, version: number): Promise<DraftVersion> {
  const res = await apiRequest("GET", `/api/builder/drafts/${appId}/versions/${version}`);
  return res.json();
}

export async function createDraft(body: {
  projectId: string;
  environmentId?: string;
  prompt: string;
  appName?: string;
}): Promise<VibeDraft> {
  const res = await apiRequest("POST", "/api/vibe/drafts", body);
  return res.json();
}

export async function listDrafts(projectId?: string): Promise<VibeDraft[]> {
  const url = projectId ? `/api/vibe/drafts?projectId=${projectId}` : "/api/vibe/drafts";
  const res = await apiRequest("GET", url);
  return res.json();
}

export async function refineDraft(draftId: string, refinementPrompt: string): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/refine`, { refinementPrompt });
  return res.json();
}

export async function previewDraft(draftId: string): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/preview`);
  return res.json();
}

export async function installDraft(draftId: string): Promise<{ draft: VibeDraft; installResult: unknown }> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/install`);
  return res.json();
}

export async function discardDraft(draftId: string): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/discard`);
  return res.json();
}

export type DraftPatchOp =
  | { op: "add_field"; recordTypeKey: string; field: { name: string; type: string } }
  | { op: "rename_field"; recordTypeKey: string; from: string; to: string }
  | { op: "remove_field"; recordTypeKey: string; fieldName: string }
  | { op: "set_sla"; recordTypeKey: string; durationMinutes: number }
  | { op: "set_assignment_group"; recordTypeKey: string; groupKey: string };

export async function patchDraft(draftId: string, ops: DraftPatchOp[]): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/patch`, { ops });
  return res.json();
}

export interface DraftVersion {
  id: string;
  tenantId: string;
  draftId: string;
  versionNumber: number;
  createdAt: string;
  createdBy: string | null;
  reason: "create" | "refine" | "patch" | "restore" | "create_variant" | "adopt_variant";
  package: GraphPackageJson;
  checksum: string;
  previewDiff: GraphDiffResult | null;
  previewErrors: GraphValidationError[] | null;
}

export async function listDraftVersions(draftId: string): Promise<DraftVersion[]> {
  const res = await apiRequest("GET", `/api/vibe/drafts/${draftId}/versions`);
  return res.json();
}

export async function restoreDraftVersion(draftId: string, versionNumber: number): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/restore`, { versionNumber });
  return res.json();
}

export interface VariantResult {
  package: GraphPackageJson;
  diff: GraphDiffResult;
  validationErrors: GraphValidationError[];
  checksum: string;
}

export async function generateMulti(body: {
  projectId: string;
  prompt: string;
  count?: number;
  appName?: string;
}): Promise<{ variants: VariantResult[] }> {
  const res = await apiRequest("POST", "/api/vibe/generate-multi", body);
  return res.json();
}

export async function createDraftFromVariant(body: {
  projectId: string;
  environmentId?: string;
  prompt: string;
  package: GraphPackageJson;
}): Promise<VibeDraft> {
  const res = await apiRequest("POST", "/api/vibe/drafts/from-variant", body);
  return res.json();
}

export interface VariantDiffResult {
  diff: GraphDiffResult;
  summary: {
    addedRecordTypes: number;
    removedRecordTypes: number;
    modifiedRecordTypes: number;
  };
}

export async function diffVariants(body: {
  projectId: string;
  packageA: GraphPackageJson;
  packageB: GraphPackageJson;
}): Promise<VariantDiffResult> {
  const res = await apiRequest("POST", "/api/vibe/variants/diff", body);
  return res.json();
}

export async function adoptVariantIntoDraft(
  draftId: string,
  body: { package: GraphPackageJson; prompt?: string },
): Promise<VibeDraft> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/adopt-variant`, body);
  return res.json();
}

export interface VersionDiffResult {
  diff: GraphDiffResult;
  summary: {
    addedRecordTypes: number;
    removedRecordTypes: number;
    modifiedRecordTypes: number;
  };
  fromVersion: number;
  toVersion: number;
}

export async function diffDraftVersions(
  draftId: string,
  fromVersion: number,
  toVersion: number,
): Promise<VersionDiffResult> {
  const res = await apiRequest("POST", `/api/vibe/drafts/${draftId}/versions/diff`, { fromVersion, toVersion });
  return res.json();
}

export interface StreamStageEvent {
  stage: "generation" | "validation" | "repair" | "projection" | "diff" | "complete" | "error";
  attempt?: number;
  result?: {
    package: GraphPackageJson | null;
    checksum: string | null;
    diff: GraphDiffResult | null;
    validationErrors: GraphValidationError[];
    schemaErrors: string | null;
    attempts: number;
    success: boolean;
  };
  error?: string;
}

/**
 * Stream a preview generation via SSE. Calls onStage for each stage event.
 * Returns the final RepairResult from the "complete" event.
 */
export async function streamPreview(
  body: { projectId: string; prompt: string; appName?: string },
  onStage: (event: StreamStageEvent) => void,
): Promise<StreamStageEvent["result"] | null> {
  const tenantId = localStorage.getItem("tenantId") || "default";
  const userId = localStorage.getItem("userId") || "user-admin";

  const response = await fetch("/api/vibe/preview/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      "x-user-id": userId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: StreamStageEvent["result"] | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: StreamStageEvent = JSON.parse(line.slice(6));
          onStage(event);
          if (event.stage === "complete" && event.result) {
            finalResult = event.result;
          }
        } catch {
          // Skip malformed events
        }
      }
    }
  }

  return finalResult;
}

// --- Token-Level Streaming ---

export type TokenStreamEvent =
  | { type: "token"; data: string; variantIndex?: number }
  | { type: "stage"; stage: string; attempt?: number; variantIndex?: number }
  | { type: "complete"; result: TokenStreamResult; variantIndex?: number }
  | { type: "error"; error: string; variantIndex?: number };

export interface TokenStreamResult {
  package: GraphPackageJson | null;
  checksum: string | null;
  diff: GraphDiffResult | null;
  validationErrors: GraphValidationError[];
  schemaErrors: string | null;
  attempts: number;
  success: boolean;
}

/**
 * Stream a preview generation with token-level SSE events.
 * Calls onEvent for each token/stage/complete/error event.
 * Returns the final TokenStreamResult from the "complete" event.
 */
export async function streamPreviewTokens(
  body: { projectId: string; prompt: string; appName?: string },
  onEvent: (event: TokenStreamEvent) => void,
): Promise<TokenStreamResult | null> {
  const tenantId = localStorage.getItem("tenantId") || "default";
  const userId = localStorage.getItem("userId") || "user-admin";

  const response = await fetch("/api/vibe/preview/stream-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      "x-user-id": userId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return consumeTokenStream(response, onEvent);
}

/**
 * Stream multi-variant generation with token-level SSE events.
 * Each event includes a variantIndex field.
 */
export async function streamMultiTokens(
  body: { projectId: string; prompt: string; count?: number; appName?: string },
  onEvent: (event: TokenStreamEvent) => void,
): Promise<TokenStreamResult[]> {
  const tenantId = localStorage.getItem("tenantId") || "default";
  const userId = localStorage.getItem("userId") || "user-admin";

  const response = await fetch("/api/vibe/generate-multi/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      "x-user-id": userId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const results: TokenStreamResult[] = [];
  await consumeTokenStream(response, (event) => {
    onEvent(event);
    if (event.type === "complete") {
      results.push(event.result);
    }
  });
  return results;
}

async function consumeTokenStream(
  response: Response,
  onEvent: (event: TokenStreamEvent) => void,
): Promise<TokenStreamResult | null> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: TokenStreamResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: TokenStreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
          if (event.type === "complete" && event.result) {
            finalResult = event.result;
          }
        } catch {
          // Skip malformed events
        }
      }
    }
  }

  return finalResult;
}
