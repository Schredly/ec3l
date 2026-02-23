import { useQuery } from "@tanstack/react-query";
import { fetchProposal, type BuilderProposal } from "@/lib/api/vibe";

export function useBuilderProposal(prompt: string) {
  const trimmed = prompt.trim();

  const query = useQuery<BuilderProposal>({
    queryKey: ["vibe-proposal", trimmed],
    queryFn: () => fetchProposal(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return query;
}
