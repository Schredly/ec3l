import { useQuery } from "@tanstack/react-query";
import { fetchBuilderDraftVersions, type DraftVersion } from "@/lib/api/vibe";

export function useDraftVersions(appId: string | undefined) {
  return useQuery<DraftVersion[]>({
    queryKey: ["builder-draft-versions", appId],
    queryFn: () => fetchBuilderDraftVersions(appId!),
    enabled: !!appId,
    staleTime: 10_000,
    retry: false,
  });
}
