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

export function useSendLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; channel: Channel }) =>
      api<SendResult>("/api/admin/leads/send", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
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
