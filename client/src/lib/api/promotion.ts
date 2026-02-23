import { apiRequest } from "../queryClient";

export interface PromotionIntent {
  id: string;
  tenantId: string;
  projectId: string;
  fromEnvironmentId: string;
  toEnvironmentId: string;
  status: "draft" | "previewed" | "approved" | "executed" | "rejected";
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  diff: unknown;
  result: unknown;
}

export interface EnvironmentInfo {
  id: string;
  name: string;
  slug: string;
  projectId: string;
  requiresPromotionApproval: boolean;
}

export async function createPromotionIntent(body: {
  projectId: string;
  fromEnvironmentId: string;
  toEnvironmentId: string;
}): Promise<PromotionIntent> {
  const res = await apiRequest("POST", "/api/admin/environments/promotions", body);
  return res.json();
}

export async function previewPromotionIntent(intentId: string): Promise<PromotionIntent> {
  const res = await apiRequest("POST", `/api/admin/environments/promotions/${intentId}/preview`);
  return res.json();
}

export async function approvePromotionIntent(intentId: string): Promise<PromotionIntent> {
  const res = await apiRequest("POST", `/api/admin/environments/promotions/${intentId}/approve`);
  return res.json();
}

export async function executePromotionIntent(intentId: string): Promise<PromotionIntent> {
  const res = await apiRequest("POST", `/api/admin/environments/promotions/${intentId}/execute`);
  return res.json();
}

export async function rejectPromotionIntent(intentId: string): Promise<PromotionIntent> {
  const res = await apiRequest("POST", `/api/admin/environments/promotions/${intentId}/reject`);
  return res.json();
}

export async function listEnvironments(projectId: string): Promise<EnvironmentInfo[]> {
  const res = await apiRequest("GET", `/api/projects/${projectId}/environments`);
  return res.json();
}

// --- Environment package state ---

export interface EnvironmentPackageState {
  packageKey: string;
  version: string;
  checksum: string;
  installedAt: string;
  source: string;
}

export interface PackageDelta {
  packageKey: string;
  fromVersion: string | null;
  toVersion: string;
  fromChecksum: string | null;
  toChecksum: string;
  status: "missing" | "outdated" | "same";
}

export interface EnvironmentDiffResult {
  fromEnvironmentId: string;
  toEnvironmentId: string;
  deltas: PackageDelta[];
}

export async function listEnvironmentPackages(envId: string): Promise<EnvironmentPackageState[]> {
  const res = await apiRequest("GET", `/api/admin/environments/${envId}/packages`);
  return res.json();
}

export async function diffEnvironments(fromEnvId: string, toEnvId: string): Promise<EnvironmentDiffResult> {
  const res = await apiRequest("GET", `/api/admin/environments/diff?fromEnvId=${encodeURIComponent(fromEnvId)}&toEnvId=${encodeURIComponent(toEnvId)}`);
  return res.json();
}

export async function listPromotionIntents(projectId: string): Promise<PromotionIntent[]> {
  const res = await apiRequest("GET", `/api/admin/environments/promotions?projectId=${encodeURIComponent(projectId)}`);
  return res.json();
}
