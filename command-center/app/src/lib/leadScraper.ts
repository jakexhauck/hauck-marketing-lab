// Pure compute for Acquisition > Leads. No React, no fetching: the wizard's
// validation, the run's status line and the selection summary are all functions
// of their arguments, so they can be pinned down without mounting anything.
//
// The scraping itself is the LIIGO SOP, ported whole into
// command-center/lead-scraper. This page is a window onto it.

export type RunSize = "quick" | "standard" | "deep";
export type Channel = "cold_call" | "sms";

export interface ScrapedLeadView {
  id: string;
  businessName: string | null;
  phoneE164: string;
  city: string | null;
  state: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  icpScore: number | null;
  icpFlags: string[];
  sendStatus: string;
  sentTo: string | null;
  sentAt: string | null;
  scoreBand: "high" | "medium" | "low";
  reasons: string[];
  category: string | null;
  metro: string | null;
  source: string | null;
  sourceKeyword: string | null;
  nicheId: string | null;
  runId: string | null;
  createdAt: string;
}

export interface ScrapeRun {
  id: string;
  nicheId: string;
  nicheLabel: string;
  states: string[];
  cities: { city: string; state: string }[];
  size: RunSize;
  status: "preparing" | "queued" | "running" | "done" | "failed" | "cancelled";
  host: string | null;
  error: string | null;
  totalQueries: number;
  doneQueries: number;
  percent: number;
  rawFound: number;
  // What is still there to ring on this run: not a duplicate, a mobile, not yet
  // sent. Counted from the leads table, so it always equals the list you get when
  // you click into the run. Null when the count could not be read.
  callable: number | null;
  kept: number;
  passed: number;
  sendable: number;
  added: number;
  hiddenAsDuplicates: number;
  rejected: number;
  sent: number;
  passRate: number | null;
  failureRate: number | null;
  blocked: boolean;
  crmSnapshotCount: number;
  crmSnapshotPartial: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NichePreset {
  id: string;
  nicheId: string;
  label: string;
  builtIn: boolean;
  summary: {
    keywords: number;
    denyTerms: number;
    coreCategories: number;
    nameSignals: number;
    threshold: number;
  };
  updatedAt: string;
}

// --- run sizes ---------------------------------------------------------------

// The wizard's second step. The wall-clock figures are the honest shape of a run,
// not a promise: gosom's pace depends on how hard Google is pushing back.
// cap is the runner's max_locations for that size (lead-scraper/build_queue.py).
// It is on the button because a size SILENTLY drops the cities it cannot fit:
// picking Quick with twenty-four cities pasted in scrapes exactly one of them.
export const RUN_SIZES: { id: RunSize; label: string; cap: number; blurb: string }[] = [
  { id: "quick", label: "Quick", cap: 1, blurb: "A few minutes. For trying a niche out." },
  { id: "standard", label: "Standard", cap: 40, blurb: "Around an hour." },
  { id: "deep", label: "Deep", cap: 400, blurb: "Everything you ticked. Leave it running." },
];

export function sizeCapLabel(cap: number): string {
  return cap === 1 ? "1 city" : `up to ${cap} cities`;
}

// --- the wizard --------------------------------------------------------------

// Three questions in the order the answers depend on each other. The trade
// decides what "already done" means for a city, and the size decides how many
// cities you are allowed to pick, so both are asked before the city list is.
export interface RunDraft {
  nicheId: string;
  size: RunSize;
  // Every city picked, in the order they were picked. The API takes states or
  // cities; the wizard now only ever sends cities, so what you ticked is
  // exactly what gets scraped.
  cities: { city: string; state: string }[];
}

export function emptyDraft(): RunDraft {
  return { nicheId: "", size: "standard", cities: [] };
}

export function cityKey(city: string, state: string): string {
  return `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

// How many cities a size will actually scrape. The runner caps by DISTINCT
// LOCATION and silently drops the rest (lead-scraper/build_queue.py), which is
// why the wizard refuses to let a list grow past it rather than letting the
// runner throw the tail away in the dark.
export function runCap(size: RunSize): number {
  return RUN_SIZES.find((s) => s.id === size)?.cap ?? 40;
}

/**
 * Add cities to the pick list, never past the cap.
 *
 * Returns the new list and how many were turned away, because a paste of sixty
 * cities into a Standard run has to say that twenty of them did not fit. The
 * alternative is the bug this cap exists to prevent, one step earlier.
 */
export function addCities(
  picked: { city: string; state: string }[],
  incoming: { city: string; state: string }[],
  cap: number,
): { cities: { city: string; state: string }[]; dropped: number } {
  const out = [...picked];
  const seen = new Set(out.map((c) => cityKey(c.city, c.state)));
  let dropped = 0;
  for (const c of incoming) {
    const key = cityKey(c.city, c.state);
    if (seen.has(key)) continue;
    if (out.length >= cap) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    out.push(c);
  }
  return { cities: out, dropped };
}

/** What the wizard will actually send. */
export function resolveRunRequest(
  draft: RunDraft,
): { nicheId: string; states: string[]; cities: { city: string; state: string }[]; size: RunSize } {
  return {
    nicheId: draft.nicheId,
    states: [],
    cities: draft.cities.slice(0, runCap(draft.size)),
    size: draft.size,
  };
}

export function draftProblem(draft: RunDraft): string | null {
  if (!draft.nicheId) return "Pick a niche.";
  if (draft.cities.length === 0) return "Pick at least one city.";
  return null;
}

// "Boise ID" or "Boise, ID" or just "Boise" -> {city, state}. Returns null for
// anything that is not a city, so a stray blank line never becomes a query.
export function parseCityLine(line: string): { city: string; state: string } | null {
  const raw = line.trim().replace(/,\s*/g, " ").replace(/\s+/g, " ");
  if (!raw) return null;
  const m = raw.match(/^(.*?)\s+([A-Za-z]{2})$/);
  if (m && m[1].trim()) {
    return { city: m[1].trim(), state: m[2].toUpperCase() };
  }
  return { city: raw, state: "" };
}

/**
 * One line per city, except when it is two.
 *
 * "Frisco / Southlake TX" is how Jake writes a pair of neighbouring towns, and
 * it used to survive whole: the runner searched Google for the literal string
 * "garage door repair Frisco / Southlake TX", and no coverage screen could ever
 * match it back to a city. Split, it is two ordinary cities sharing the state
 * written on the end of the line, which is what was meant.
 */
export function parseCityList(text: string): { city: string; state: string }[] {
  const out: { city: string; state: string }[] = [];
  const seen = new Set<string>();
  for (const line of (text ?? "").split(/[\n;]/)) {
    const parsed = parseCityLine(line);
    if (!parsed) continue;
    // The state is written once, at the end of the line, so it is read once and
    // handed to every city on it.
    for (const part of parsed.city.split("/")) {
      const city = part.trim();
      if (!city) continue;
      const key = cityKey(city, parsed.state);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ city, state: parsed.state });
    }
  }
  return out;
}

// --- reading a run -----------------------------------------------------------

export function isRunActive(run: ScrapeRun | null | undefined): boolean {
  return !!run && (run.status === "preparing" || run.status === "queued" || run.status === "running");
}

/**
 * The line under the progress bar.
 *
 * "queued" is the state that needs explaining: the app has done its half and is
 * waiting for a runner on the Mac or the PC. Saying so is the difference between
 * a page that looks broken and a page that is telling you to go start the runner.
 */
export function runStatusLine(run: ScrapeRun): string {
  switch (run.status) {
    case "preparing":
      return "Checking which businesses you already have in the CRM.";
    case "queued":
      return "Waiting for the scraper to pick it up. Start the runner on your Mac or PC.";
    case "running":
      return run.blocked
        ? "Google is throttling us. Maps is paused; the directory fallback is still going."
        : `Scraping. ${run.doneQueries} of ${run.totalQueries} searches done.`;
    case "done":
      return run.added > 0
        ? `Finished. ${run.added} new ${run.added === 1 ? "lead" : "leads"} added.`
        : "Finished. Nothing new came back.";
    case "failed":
      return run.error ?? "The run failed.";
    case "cancelled":
      return "Cancelled.";
    default:
      return run.status;
  }
}

// The SOP's niche pass rate (kept / raw), which is the single best read on whether
// the targeting is working. Null until a run has actually seen something.
export function passRateLabel(run: ScrapeRun): string | null {
  if (run.rawFound === 0) return null;
  const rate = run.passRate ?? run.kept / run.rawFound;
  return `${Math.round(rate * 100)}% of what Google returned was worth keeping`;
}

// The number that is actually worth reading: how much of what Google returned is
// left to ring. Kept is what was STORED, counted per write, and two of every three
// qualified businesses are landlines, so the kept figure reads several times better
// than the run really did. Null when there is nothing to compare yet.
export function sendRateLabel(run: ScrapeRun): string | null {
  if (run.rawFound === 0 || !run.callable) return null;
  const pct = (run.callable / run.rawFound) * 100;
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}% of what Google returned is worth a call`;
}

// --- the selection -----------------------------------------------------------

export interface SelectionSummary {
  ticked: number;
  sendable: number;
  blocked: number;
  reason: string | null;
}

/**
 * What the send button should say, and whether it should be enabled.
 *
 * The same rules the server enforces, mirrored here so a lead that cannot go out
 * is greyed before it is ticked rather than rejected after. The server stays the
 * authority: this only decides what the button reads.
 *
 * There is no score here, and its absence is the point. The gate came out of the
 * server on 20 August (35a4c944) and out of the Ready to send filter with it, but
 * this copy of the rule was missed, so the button went on refusing what the server
 * would happily have taken. Every CSV-imported lead carries no score at all, and
 * `?? 0` read that as a zero: on 21 August all 75 imported leads waiting to go out
 * were untickable while the server stood ready to send every one of them.
 *
 * Two rules, both facts rather than opinions: it has not gone out already, and it
 * has a name to put on the contact.
 */
export function summariseSelection(
  leads: ScrapedLeadView[],
  selectedIds: Set<string>,
): SelectionSummary {
  const chosen = leads.filter((l) => selectedIds.has(l.id));
  const sendable = chosen.filter(
    (l) => l.sendStatus === "pending" && (l.businessName ?? "").trim().length > 0,
  );
  const blocked = chosen.length - sendable.length;
  return {
    ticked: chosen.length,
    sendable: sendable.length,
    blocked,
    reason: blocked > 0 ? `${blocked} cannot be sent (already sent, or no business name)` : null,
  };
}

export function canSend(summary: SelectionSummary): boolean {
  return summary.sendable > 0;
}

// --- formatting --------------------------------------------------------------

export function formatScore(score: number | null): string {
  return score === null || Number.isNaN(score) ? "-" : String(Math.round(score));
}

export function formatRating(rating: number | null, reviews: number | null): string {
  if (rating === null && reviews === null) return "No reviews";
  if (rating === null) return `${reviews} reviews`;
  const stars = rating.toFixed(1);
  return reviews === null ? stars : `${stars} (${reviews})`;
}

// The domain, not the URL. A table full of "https://www." is a table of noise.
export function prettyDomain(website: string | null): string {
  if (!website) return "";
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

export function channelLabel(channel: Channel): string {
  return channel === "cold_call" ? "Cold Call" : "SMS";
}
