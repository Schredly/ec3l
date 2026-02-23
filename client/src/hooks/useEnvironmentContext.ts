import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface Project {
  id: string;
  name: string;
}

interface Environment {
  id: string;
  name: "dev" | "test" | "prod";
  projectId: string;
  isDefault: boolean;
  requiresPromotionApproval: boolean;
}

interface PromotionIntent {
  id: string;
  status: "draft" | "previewed" | "approved" | "executed" | "rejected";
}

export type EnvironmentLabel = "DEV" | "TEST" | "PROD";

export interface EnvironmentContext {
  environment: EnvironmentLabel;
  hasDrift: boolean;
  pendingPromotions: number;
  isLoading: boolean;
}

const ACTIVE_PROMOTION_STATUSES = new Set(["draft", "previewed", "approved"]);

/**
 * Aggregates environment awareness across all projects.
 *
 * - Resolves the "highest" environment that exists (PROD > TEST > DEV).
 * - Counts non-terminal promotion intents as pending promotions.
 * - Drift detection requires a per-environment diff which is project-scoped
 *   and expensive — stubbed false until a dedicated drift summary endpoint
 *   exists. The visual language is wired and ready.
 *
 * All queries are read-only. Failures degrade gracefully to DEV / 0 / false.
 */
export function useEnvironmentContext(): EnvironmentContext {
  // 1. Fetch all projects
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60_000,
  });

  const firstProjectId = projects?.[0]?.id;

  // 2. Fetch environments for the first project (if available)
  const { data: environments, isLoading: envsLoading } = useQuery<Environment[]>({
    queryKey: ["/api/projects", firstProjectId, "environments"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!firstProjectId,
    staleTime: 60_000,
  });

  // 3. Fetch promotion intents for the first project
  const { data: intents } = useQuery<PromotionIntent[]>({
    queryKey: ["/api/admin/environments/promotions", `?projectId=${firstProjectId}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!firstProjectId,
    staleTime: 30_000,
  });

  // Resolve environment label — pick the highest tier that exists
  let environment: EnvironmentLabel = "DEV";
  if (environments && environments.length > 0) {
    const names = new Set(environments.map((e) => e.name));
    if (names.has("prod")) environment = "PROD";
    else if (names.has("test")) environment = "TEST";
    else environment = "DEV";
  }

  // Count non-terminal promotion intents
  const pendingPromotions = intents
    ? intents.filter((i) => ACTIVE_PROMOTION_STATUSES.has(i.status)).length
    : 0;

  // Drift detection — stubbed until a lightweight drift summary endpoint exists.
  // The diff endpoint (GET /api/admin/environments/diff) requires two specific
  // environment IDs and is project-scoped, making it too expensive for a global
  // shell indicator without a dedicated aggregation endpoint.
  const hasDrift = false;

  return {
    environment,
    hasDrift,
    pendingPromotions,
    isLoading: envsLoading,
  };
}
