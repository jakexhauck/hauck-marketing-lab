import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  isRunActive,
  type Channel,
  type MetroCity,
  type NichePreset,
  type RunSize,
  type ScrapeRun,
  type ScrapedLeadView,
} from "../lib/leadScraper";

// Data hooks for Acquisition > Leads. Agency-global admin data, so no tenant is
// threaded through any key.
//
// The run list polls while anything is active and stops the moment it is not.
// The scraping happens on Jake's own machine, so the app genuinely does not know
// when something changed except by asking; polling only while a run is live keeps
// that from being a permanent background request.

const LEADS_KEY = ["admin", "leads"] as const;
const RUNS_KEY = ["admin", "leads", "runs"] as const;
const PRESETS_KEY = ["admin", "leads", "presets"] as const;
const METROS_KEY = ["admin", "leads", "metros"] as const;

const POLL_MS = 4000;

export const leadScraperKeys = {
  leads: (filters: LeadFilters) => [...LEADS_KEY, filters] as const,
  runs: () => RUNS_KEY,
  presets: () => PRESETS_KEY,
  metros: (states: string[]) => [...METROS_KEY, [...states].sort().join(",")] as const,
};

export interface LeadFilters {
  runId?: string | null;
  nicheId?: string | null;
  sent?: "0" | "1" | null;
  q?: string;
}

interface LeadsResponse {
  leads: ScrapedLeadView[];
  total: number;
  offset: number;
  limit: number;
}

function leadsPath(filters: LeadFilters): string {
  const params = new URLSearchParams();
  if (filters.runId) params.set("runId", filters.runId);
  if (filters.nicheId) params.set("nicheId", filters.nicheId);
  if (filters.sent) params.set("sent", filters.sent);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  const qs = params.toString();
  return `/api/admin/leads${qs ? `?${qs}` : ""}`;
}

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: leadScraperKeys.leads(filters),
    queryFn: () => api<LeadsResponse>(leadsPath(filters)),
  });
}

export function useScrapeRuns() {
  return useQuery({
    queryKey: leadScraperKeys.runs(),
    queryFn: () => api<{ runs: ScrapeRun[] }>("/api/admin/leads/runs"),
    // Poll only while something is actually in flight.
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some(isRunActive) ? POLL_MS : false;
    },
  });
}

export function useNichePresets() {
  return useQuery({
    queryKey: leadScraperKeys.presets(),
    queryFn: () => api<{ presets: NichePreset[] }>("/api/admin/leads/presets"),
  });
}

// The cities a set of states would be scraped as. Empty states means the caller is
// drawing the state picker, which is a different shape, so it is not fetched here.
export function useMetroCities(states: string[]) {
  return useQuery({
    queryKey: leadScraperKeys.metros(states),
    queryFn: () =>
      api<{ cities: MetroCity[] }>(
        `/api/admin/leads/metros?states=${encodeURIComponent(states.join(","))}`,
      ),
    enabled: states.length > 0,
  });
}

export function useAvailableStates() {
  return useQuery({
    queryKey: [...METROS_KEY, "states"] as const,
    queryFn: () =>
      api<{ states: { state: string; metros: number; cities: number }[] }>(
        "/api/admin/leads/metros",
      ),
  });
}

export interface StartRunInput {
  nicheId: string;
  states: string[];
  cities: { city: string; state: string }[];
  size: RunSize;
}

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartRunInput) =>
      api<{ run: ScrapeRun }>("/api/admin/leads/runs", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RUNS_KEY });
    },
  });
}

export interface SendResult {
  channel: Channel;
  label: string;
  sent: number;
  addedToProspectBook: number;
  skipped: { id: string; reason: string }[];
  notConfigured: boolean;
}

// Where a send has got to. `etaMs` is null until the first batch has landed,
// because before that there is nothing honest to estimate from.
export interface SendProgress {
  done: number;
  total: number;
  etaMs: number | null;
}

// A batch of 200 is 200 sequential GoHighLevel pushes on the server, so it is
// sent in slices of this many: each slice is one request, and the page counts
// them off as they land. Small enough that the bar moves every few seconds,
// large enough that the request overhead stays a rounding error.
const SEND_SLICE = 10;

export function useSendLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ids: string[];
      channel: Channel;
      // Cold Call, and onto GoHighLevel's power dialer as well: the same send
      // with the "Power Dialer" tag added, which is what puts them on the phone
      // list over there.
      powerDialer?: boolean;
      onProgress?: (p: SendProgress) => void;
    }): Promise<SendResult> => {
      const { ids, channel, powerDialer, onProgress } = input;
      const total = ids.length;
      const merged: SendResult = {
        channel,
        label: "",
        sent: 0,
        addedToProspectBook: 0,
        skipped: [],
        notConfigured: false,
      };
      const startedAt = Date.now();
      let done = 0;
      onProgress?.({ done, total, etaMs: null });
      for (let i = 0; i < ids.length; i += SEND_SLICE) {
        const slice = ids.slice(i, i + SEND_SLICE);
        const res = await api<SendResult>("/api/admin/leads/send", {
          method: "POST",
          body: JSON.stringify({ ids: slice, channel, powerDialer: powerDialer === true }),
        });
        merged.label = res.label || merged.label;
        merged.sent += res.sent;
        merged.addedToProspectBook += res.addedToProspectBook;
        merged.skipped.push(...res.skipped);
        merged.notConfigured = merged.notConfigured || res.notConfigured;
        done += slice.length;
        const perLead = (Date.now() - startedAt) / done;
        onProgress?.({ done, total, etaMs: Math.round(perLead * (total - done)) });
        // Nothing further will go if GoHighLevel is not connected; stop
        // rather than fail the same way nineteen more times.
        if (res.notConfigured) break;
      }
      return merged;
    },
    // On settle, not success: a batch that fails halfway has still stamped the
    // slices before it, and the page must stop showing those as sendable.
    onSettled: () => {
      // Both: the leads change status, and the run's sent tally moves with them.
      void qc.invalidateQueries({ queryKey: LEADS_KEY });
      void qc.invalidateQueries({ queryKey: RUNS_KEY });
    },
  });
}

export interface SavePresetInput {
  label: string;
  keywords: string;
  allowCore: string;
  deny: string;
  nameSignals: string;
  basedOn?: string;
}

export function useSavePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePresetInput) =>
      api<{ preset: NichePreset }>("/api/admin/leads/presets", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PRESETS_KEY });
    },
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nicheId: string) =>
      api<{ ok: true }>(`/api/admin/leads/presets?nicheId=${encodeURIComponent(nicheId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PRESETS_KEY });
    },
  });
}
