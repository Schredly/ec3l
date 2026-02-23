import { useQuery } from "@tanstack/react-query";
import { fetchBuilderDraftDiff, type BuilderDiffResult } from "@/lib/api/vibe";

export function useDraftDiff(
  appId: string | undefined,
  fromVersion: number | null,
  toVersion: number | null,
) {
  return useQuery<BuilderDiffResult>({
    queryKey: ["builder-draft-diff", appId, fromVersion, toVersion],
    queryFn: () => fetchBuilderDraftDiff(appId!, fromVersion!, toVersion!),
    enabled: !!appId && fromVersion !== null && toVersion !== null && fromVersion !== toVersion,
    staleTime: 30_000,
    retry: false,
  });
}
