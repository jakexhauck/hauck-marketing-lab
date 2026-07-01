// command-center/app/src/hooks/useRecurrence.ts
import { useMemo } from "react";
import {
  useRecurrenceQuery,
  useUpsertRecurrence,
  useDeleteRecurrence,
} from "./useApi";
import type { ApiRecurrence } from "../lib/api";

// Single entry point the Customers UI uses. Always enabled: in demo mode api()
// routes to the demo handler (Task 6), and a real session is authenticated by
// the middleware, so this works in both preview and real sessions.
export function useRecurrence() {
  const query = useRecurrenceQuery(true);
  const upsert = useUpsertRecurrence();
  const remove = useDeleteRecurrence();
  const byContact = useMemo(() => {
    const map: Record<string, ApiRecurrence> = {};
    for (const r of query.data?.recurrences ?? []) map[r.contactId] = r;
    return map;
  }, [query.data]);
  return { byContact, isLoading: query.isLoading, upsert, remove };
}
