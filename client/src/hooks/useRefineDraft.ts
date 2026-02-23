import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refineBuilderDraft } from "@/lib/api/vibe";

export function useRefineDraft(appId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prompt: string) => refineBuilderDraft(appId!, prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builder-draft", appId] });
      queryClient.invalidateQueries({ queryKey: ["builder-draft-versions", appId] });
    },
  });
}
