import type { AgencyPipeline } from "./api";
import { COLD_CALL_STAGES } from "./coldCallStages";

// Comparing the app's stage list against the live one in GoHighLevel.
//
// COLD_CALL_STAGES is hard-coded and GoHighLevel is free to change. Rename a
// stage over there, or add one, and its leads arrive here carrying a status the
// console has never heard of. metaFor() stops that being a white screen, but a
// grey pill is where the drift is DISCOVERED, and by then somebody is already
// confused about why a prospect has no page.
//
// This is where it is noticed instead: the two lists side by side, and a plain
// statement of what does not match.
//
// Names are the join, because names are what the console stores as a lead's
// status. Two stages whose names differ are two different stages as far as
// everything downstream is concerned, whatever the ids say.

export type StageMatch = "matched" | "missing" | "extra";

export interface StageComparisonRow {
  name: string;
  // matched  in both lists
  // missing  the app expects it; GoHighLevel does not have it
  // extra    GoHighLevel has it; the app has no page for it
  match: StageMatch;
}

export interface StageComparison {
  // The pipeline the comparison was made against, or null if none was found.
  pipelineName: string | null;
  rows: StageComparisonRow[];
  missing: string[];
  extra: string[];
  inSync: boolean;
}

// Whitespace and case are presentation, not identity: "Call back" and
// "Call Back" are one stage that somebody typed twice.
function key(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Which of the account's pipelines is the cold calling one.
//
// By overlap rather than by name, because the pipeline can be called anything
// and the stages are the thing being compared: whichever board shares the most
// stage names with the app is the board the app is about. A name match is only
// the tie-break, for the case where drift is severe enough that overlap is low.
export function pickColdCallPipeline(pipelines: AgencyPipeline[]): AgencyPipeline | null {
  if (pipelines.length === 0) return null;

  const wanted = new Set(COLD_CALL_STAGES.map((s) => key(s.label)));
  let best: AgencyPipeline | null = null;
  let bestScore = -1;

  for (const p of pipelines) {
    const overlap = p.stages.filter((s) => wanted.has(key(s.name))).length;
    const named = key(p.name).includes("cold") ? 1 : 0;
    const score = overlap * 10 + named;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  // Nothing matched on either count: refusing to guess is more useful than
  // naming an unrelated board and calling every stage in it drift.
  return bestScore > 0 ? best : null;
}

export function compareStages(pipelines: AgencyPipeline[]): StageComparison {
  const pipeline = pickColdCallPipeline(pipelines);
  const live = pipeline?.stages ?? [];
  const liveKeys = new Map(live.map((s) => [key(s.name), s.name]));
  const appKeys = new Set(COLD_CALL_STAGES.map((s) => key(s.label)));

  // The app's own order first, because that is the order of the pages, then
  // whatever GoHighLevel has that we do not.
  const rows: StageComparisonRow[] = COLD_CALL_STAGES.map((s) => ({
    name: s.label,
    match: liveKeys.has(key(s.label)) ? ("matched" as const) : ("missing" as const),
  }));

  for (const s of live) {
    if (!appKeys.has(key(s.name))) rows.push({ name: s.name, match: "extra" });
  }

  const missing = rows.filter((r) => r.match === "missing").map((r) => r.name);
  const extra = rows.filter((r) => r.match === "extra").map((r) => r.name);

  return {
    pipelineName: pipeline?.name ?? null,
    rows,
    missing,
    extra,
    // A pipeline we could not identify is not "in sync", it is unknown, and
    // saying everything matches would be the more comfortable lie.
    inSync: pipeline !== null && missing.length === 0 && extra.length === 0,
  };
}
