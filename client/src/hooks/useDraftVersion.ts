import { useQuery } from "@tanstack/react-query";
import { fetchBuilderDraftVersion, type DraftVersion } from "@/lib/api/vibe";

export function useDraftVersion(appId: string | undefined, version: number | null) {
  return useQuery<DraftVersion>({
    queryKey: ["builder-draft-version", appId, version],
    queryFn: () => fetchBuilderDraftVersion(appId!, version!),
    enabled: !!appId && version !== null,
    staleTime: Infinity, // Versions are immutable
    retry: false,
  });
}
