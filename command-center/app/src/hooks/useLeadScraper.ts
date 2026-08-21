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
  // "1" the imported list, "0" the scraped one. The two pages are the same table
  // and the same components, told apart by this and nothing else.
  imported?: "0" | "1" | null;
  q?: string;
  // An IANA zone from CALL_ZONES, or absent for every timezone. Filtered on the
  // server (0118), not here: the browser holds one page of the list, so a zone
  // picked in it would filter the page rather than the list.
  zone?: string | null;
  // How many rows to ask for. Absent means the server's default of 200, which is
  // what the table opens with; the footer raises it when there are more.
  limit?: number;
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
  if (filters.imported) params.set("imported", filters.imported);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.limit) params.set("limit", String(filters.limit));
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
  // How many came out of it carrying the "Power Dialer" tag, which includes the
  // ones this send skipped: a lead already sent, or already in the book, is
  // exactly who a dialer run is for, and refusing it the tag is how a list of
  // eighty ends up a list of nine.
  taggedForDialer: number;
  skipped: { id: string; reason: string }[];
  notConfigured: boolean;
  // A lead reached GoHighLevel but could not be marked as sent here. The server
  // has always reported it and the page used to drop it on the floor, which is
  // the one state where saying nothing is worse than saying anything: the lead
  // looks sendable and is already over there.
  stampFailed: boolean;
  // A batch that never came back. The send carries on to the next batch rather
  // than abandoning the rest, so this is a note on the receipt and not the end
  // of it. Null when every batch answered.
  stoppedEarly: string | null;
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
// them off as they land.
//
// EIGHT, not ten, and the number is a budget rather than a preference. Pages
// Functions on the free plan cut a request off at fifty outbound calls, and the
// send spends two a lead plus about nine fixed, so eight leaves roughly half the
// allowance unspent. Ten used to cost sixty-five and failed most of the way
// through a full slice. Raising this without reading the budget in send.ts is how
// that comes back.
const SEND_SLICE = 8;

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
        taggedForDialer: 0,
        skipped: [],
        notConfigured: false,
        stampFailed: false,
        stoppedEarly: null,
      };
      const startedAt = Date.now();
      let done = 0;
      onProgress?.({ done, total, etaMs: null });
      for (let i = 0; i < ids.length; i += SEND_SLICE) {
        const slice = ids.slice(i, i + SEND_SLICE);
        // A batch that throws is CAUGHT, and the send carries on.
        //
        // It used to throw straight out of the loop, which meant the mutation
        // rejected and every count collected so far went with it: the page said
        // "the send stopped early" and could not say that forty had already
        // landed, or which forty. Worse, it abandoned batches that would have
        // worked. One bad batch is one batch, so it is recorded on the receipt
        // and the next one goes.
        let res: SendResult;
        try {
          res = await api<SendResult>("/api/admin/leads/send", {
            method: "POST",
            body: JSON.stringify({ ids: slice, channel, powerDialer: powerDialer === true }),
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : "The send failed for these.";
          merged.stoppedEarly ??= reason;
          for (const id of slice) merged.skipped.push({ id, reason });
          done += slice.length;
          onProgress?.({ done, total, etaMs: null });
          continue;
        }
        merged.label = res.label || merged.label;
        merged.sent += res.sent;
        merged.addedToProspectBook += res.addedToProspectBook;
        merged.taggedForDialer += res.taggedForDialer ?? 0;
        merged.skipped.push(...res.skipped);
        merged.notConfigured = merged.notConfigured || res.notConfigured;
        merged.stampFailed = merged.stampFailed || res.stampFailed === true;
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

export interface ImportLeadRow {
  phone: string;
  businessName?: string;
  city?: string;
  state?: string;
  website?: string;
  niche?: string;
}

export interface ImportResult {
  imported: number;
  alreadyHad: number;
  noPhone: number;
  duplicateInFile: number;
  received: number;
}

// Put an external scraper's CSV into the same table our own scraper writes to.
// Invalidates the leads list because the rows appear there the moment they land.
export function useImportScrapedLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: ImportLeadRow[]) =>
      api<ImportResult>("/api/admin/leads/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_KEY });
    },
  });
}
