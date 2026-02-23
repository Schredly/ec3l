import { useQuery } from "@tanstack/react-query";
import { fetchBuilderProdState, type ProdState } from "@/lib/api/vibe";

export function useProdState(appId: string | undefined) {
  return useQuery<ProdState>({
    queryKey: ["builder-prod-state", appId],
    queryFn: () => fetchBuilderProdState(appId!),
    enabled: !!appId,
    staleTime: 30_000,
    retry: false,
  });
}
