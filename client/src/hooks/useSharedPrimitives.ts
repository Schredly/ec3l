import { useQuery } from "@tanstack/react-query";
import { fetchSharedPrimitives, type SharedPrimitivesResult } from "@/lib/api/primitives";

export function useSharedPrimitives() {
  return useQuery<SharedPrimitivesResult>({
    queryKey: ["shared-primitives"],
    queryFn: fetchSharedPrimitives,
    staleTime: 30_000,
  });
}
