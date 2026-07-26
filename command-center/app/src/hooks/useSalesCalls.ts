import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { mapApiCall, type SalesCall, type NoteSection } from "../lib/salesCalls";

// Data layer for Sales > Sales Calls. Its own module rather than useApi.ts for
// the same reason useAdminLeads.ts is: this is admin-only agency data with a
// self-contained shape.
//
// One window query backs all four views. The views are pure functions over the
// same list (src/lib/salesCalls.ts), so switching tabs never refetches, and a
// call logged in one view is immediately correct in the others.

const PATH = "/api/admin/sales-calls";
const SETTINGS_PATH = "/api/admin/sales-calls/settings";

const KEY = ["admin", "sales-calls"] as const;
const SETTINGS_KEY = ["admin", "sales-calls", "settings"] as const;

interface RawResponse {
  configured: boolean;
  calendarChosen: boolean;
  timezone?: string;
  calls: Record<string, unknown>[];
}

export interface SalesCallsData {
  // False when AGENCY_GHL_LOCATION_ID / AGENCY_GHL_TOKEN are unset.
  configured: boolean;
  // False when nobody has nominated which calendar holds demo calls.
  calendarChosen: boolean;
  timezone: string;
  calls: SalesCall[];
}

// The window the page asks for: wide enough that History has something in it
// and Upcoming reaches a fortnight out, narrow enough to stay one GHL call.
// Both bounds are computed from the same instant so a query key cannot change
// mid-render and cause a refetch loop.
export function defaultWindow(now = new Date()): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - 120 * 864e5).toISOString(),
    end: new Date(now.getTime() + 30 * 864e5).toISOString(),
  };
}

export function useSalesCallsQuery(window: { start: string; end: string }) {
  return useQuery({
    queryKey: [...KEY, window.start, window.end],
    staleTime: 30_000,
    queryFn: async (): Promise<SalesCallsData> => {
      const raw = await api<RawResponse>(
        `${PATH}?start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}`,
      );
      return {
        configured: raw.configured,
        calendarChosen: raw.calendarChosen,
        timezone: raw.timezone ?? "America/New_York",
        calls: (raw.calls ?? []).map(mapApiCall),
      };
    },
  });
}

// The fields a log write may carry. Mirrors the server whitelist in
// functions/api/admin/sales-calls/log.ts. Every one is optional: a PATCH
// carrying only `scratchpad` touches only scratchpad, which is what lets the
// mid-call autosave run without any risk to an outcome.
export interface SalesCallPatch {
  id: string;
  started?: boolean;
  ended?: boolean;
  sections?: Record<string, string>;
  scratchpad?: string;
  outcome?: string | null;
  qualified?: boolean | null;
  notAFitReason?: string | null;
  followUpAt?: string | null;
  deal?: Record<string, number | undefined> | null;
  cashCollected?: number | string | null;
}

// Optimistic, because this fires on every few keystrokes of note-taking while
// somebody is talking. A note that visibly lags what was typed is a note that
// gets typed twice.
export function useLogSalesCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SalesCallPatch) =>
      api<{ ok: true }>(`${PATH}/log`, { method: "PATCH", body: JSON.stringify(patch) }),

    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      // Every cached window, not just the current one: the same call can sit in
      // more than one, and leaving a stale copy behind is how a logged call
      // reappears as unlogged after a tab switch.
      const snapshots = qc.getQueriesData<SalesCallsData>({ queryKey: KEY });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<SalesCallsData>(key, {
          ...data,
          calls: data.calls.map((c) => (c.id === patch.id ? applyPatch(c, patch) : c)),
        });
      }
      return { snapshots };
    },

    onError: (_err, _patch, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        qc.setQueryData(key, data);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

// The optimistic view of a patch. Deliberately mirrors what the endpoint does
// with the same body, including leaving untouched anything the patch omits.
function applyPatch(call: SalesCall, patch: SalesCallPatch): SalesCall {
  const next: SalesCall = { ...call };
  const nowIso = new Date().toISOString();

  if (patch.started) next.startedAt = nowIso;
  if (patch.ended) next.endedAt = nowIso;
  if (patch.sections !== undefined) next.sections = patch.sections;
  if (patch.scratchpad !== undefined) next.scratchpad = patch.scratchpad;
  if (patch.outcome !== undefined) next.outcome = patch.outcome as SalesCall["outcome"];
  if (patch.qualified !== undefined) next.qualified = patch.qualified;
  if (patch.notAFitReason !== undefined) next.notAFitReason = patch.notAFitReason;
  if (patch.followUpAt !== undefined) next.followUpAt = patch.followUpAt;
  if (patch.deal !== undefined) next.deal = (patch.deal as SalesCall["deal"]) ?? null;
  if (patch.cashCollected !== undefined) {
    const n = Number(patch.cashCollected);
    next.cashCollected = Number.isFinite(n) ? n : null;
  }

  // The server derives this from the two timestamps rather than trusting a
  // client timer; mirror that so the optimistic row does not briefly disagree.
  if (patch.ended && next.startedAt) {
    const seconds = Math.round((Date.parse(nowIso) - Date.parse(next.startedAt)) / 1000);
    if (Number.isFinite(seconds) && seconds > 0) next.durationSeconds = seconds;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Settings

export interface SalesCallSettings {
  demoCalendarId: string | null;
  noteSections: NoteSection[];
  updatedAt: string | null;
}

export function useSalesCallSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: () => api<SalesCallSettings>(SETTINGS_PATH),
  });
}

export function useSaveSalesCallSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { demoCalendarId?: string | null; noteSections?: NoteSection[] }) =>
      api<SalesCallSettings>(SETTINGS_PATH, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
      // Changing the calendar changes what the page is even about, so the
      // window query has to go rather than settle.
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
