import type { AgencyPipeline } from "./api";
import { COLD_CALL_STAGES } from "./coldCallStages";
import { pickColdCallPipeline as pickBoard } from "../../functions/lib/coldCallSync";

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
// The rule itself lives in functions/lib/coldCallSync.ts, because the server
// answers the same question when it pulls prospects out of that board. Two
// copies could disagree, and then this panel would report drift against one
// board while the sync imported from another.
export function pickColdCallPipeline(pipelines: AgencyPipeline[]): AgencyPipeline | null {
  return pickBoard(
    pipelines,
    COLD_CALL_STAGES.map((s) => s.label),
  );
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
