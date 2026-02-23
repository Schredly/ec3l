import { useQuery } from "@tanstack/react-query";
import { fetchBuilderPromotionIntents, type BuilderPromotionIntent } from "@/lib/api/vibe";

export function usePromotionIntents(appId: string | undefined) {
  return useQuery<BuilderPromotionIntent[]>({
    queryKey: ["builder-promotion-intents", appId],
    queryFn: () => fetchBuilderPromotionIntents(appId!),
    enabled: !!appId,
    staleTime: 15_000,
    retry: false,
  });
}
