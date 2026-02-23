import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pullDownFromProd } from "@/lib/api/vibe";

export function usePullDownDraft(appId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => pullDownFromProd(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builder-draft", appId] });
      queryClient.invalidateQueries({ queryKey: ["builder-draft-versions", appId] });
    },
  });
}
