import { useQuery } from "@tanstack/react-query";
import { fetchBuilderDraftPreflight, type PreflightResult } from "@/lib/api/vibe";

export function useDraftPreflight(appId: string | undefined, enabled: boolean) {
  return useQuery<PreflightResult>({
    queryKey: ["builder-draft-preflight", appId],
    queryFn: () => fetchBuilderDraftPreflight(appId!),
    enabled: !!appId && enabled,
    staleTime: 0,
    retry: false,
  });
}
