import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getColdCallSlots } from "../lib/api";

// The Add a client page: the links it hands out, and booking the onboarding call.
//
// The slots come from the cold-call slots route rather than one of their own.
// That endpoint takes any calendar id on the agency account and is read-only, so
// pointing it at the onboarding calendar is the whole difference. A second
// endpoint doing the same GET would only be a second thing to keep in step.

export interface NewClientKit {
  /** Where the intake funnel is published, or null while it is not. */
  funnelUrl: string | null;
  links: Record<string, string>;
  calendarId: string;
}

export function useNewClientKit() {
  return useQuery({
    queryKey: ["admin", "new-client", "kit"],
    staleTime: 60_000,
    queryFn: () => api<NewClientKit>("/api/admin/onboarding/new-client"),
  });
}

export function useSaveAgencyLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (links: Record<string, string>) =>
      api<{ ok: true; saved: number }>("/api/admin/onboarding/new-client", {
        method: "PUT",
        body: JSON.stringify({ links }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "new-client", "kit"] });
    },
  });
}

/** Free times on the onboarding calendar. Read-only, safe to poll. */
export function useOnboardingSlots(calendarId: string) {
  return useQuery({
    queryKey: ["admin", "onboarding", "slots", calendarId],
    enabled: Boolean(calendarId),
    staleTime: 30_000,
    queryFn: () => getColdCallSlots(calendarId, 31),
  });
}

export interface BookCallInput {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  startTime: string;
  endTime: string;
}

// Books for real, on a real calendar. Never retried: a resent POST double-books.
export function useBookOnboardingCall() {
  return useMutation({
    retry: false,
    mutationFn: (input: BookCallInput) =>
      api<{ ok: true; contactId: string; startTime: string }>(
        "/api/admin/onboarding/book-call",
        { method: "POST", body: JSON.stringify(input) },
      ),
  });
}
