import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBuilderPromotionIntent } from "@/lib/api/vibe";

export function useCreatePromotionIntent(appId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createBuilderPromotionIntent(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builder-promotion-intents", appId] });
    },
  });
}
