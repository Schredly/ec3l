import { useMutation, useQueryClient } from "@tanstack/react-query";
import { installBuilderDraft } from "@/lib/api/vibe";

export function useInstallDraft(appId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => installBuilderDraft(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builder-draft", appId] });
      queryClient.invalidateQueries({ queryKey: ["builder-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes/timeline"] });
    },
  });
}
