import { useQuery } from "@tanstack/react-query";
import { fetchBuilderDraft, type VibeDraft } from "@/lib/api/vibe";

export function useAppDraft(appId: string | undefined) {
  return useQuery<VibeDraft>({
    queryKey: ["builder-draft", appId],
    queryFn: () => fetchBuilderDraft(appId!),
    enabled: !!appId,
    staleTime: 30_000,
    retry: false,
  });
}
