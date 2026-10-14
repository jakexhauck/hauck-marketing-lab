import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReactivationMessagesData } from "../lib/reactivationMessages";

// The Reactivation > Messages surface reads the recent SMS + email exchanged
// with reactivation customers through this hook. It hits
// /api/reactivation/messages (conversations scoped to reactivation-origin
// contacts). In a demo session api() short-circuits to
// DEMO_REACTIVATION_MESSAGES, so the return shape is identical either way.
export function useReactivationMessages(enabled: boolean) {
  return useQuery({
    queryKey: ["reactivation", "messages"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<ReactivationMessagesData>("/api/reactivation/messages"),
  });
}
