import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReactivationData } from "../lib/reactivation";

// The Reactivation surface reads its rolled-up counts through this hook. It hits
// /api/campaigns/reactivation (the Database Reactivation pipeline, resolved by
// name). In a demo session api() short-circuits to DEMO_REACTIVATION, so the
// return shape is identical either way and nothing downstream changes.
export function useReactivation(enabled: boolean) {
  return useQuery({
    queryKey: ["campaigns", "reactivation"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<ReactivationData>("/api/campaigns/reactivation"),
  });
}
