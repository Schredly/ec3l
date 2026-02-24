import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { TimelineEntry } from "@/lib/api/timeline";

export function useTimeline() {
  return useQuery<TimelineEntry[]>({
    queryKey: ["/api/changes/timeline"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 15_000,
  });
}
