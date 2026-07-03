import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { AudiencesData } from "../lib/campaignsAudiences";

// The Audiences surface reads its live segment counts through this hook. It hits
// /api/campaigns/audiences (derived from the client's GHL contacts). In a demo
// session api() short-circuits to DEMO_AUDIENCES_DATA, so the return shape is
// identical either way and nothing downstream changes.
export function useCampaignsAudiences(enabled: boolean) {
  return useQuery({
    queryKey: ["campaigns", "audiences"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<AudiencesData>("/api/campaigns/audiences"),
  });
}
