import type { GhlContext } from "../../lib/ghl";
import { ghlJson } from "../../lib/ghl";
import type { SalesCallOutcome } from "../../lib/salesCalls";
import {
  findStage,
  missingStages,
  routeFor,
  SALES_PIPELINE_NAME,
  type NamedStage,
  type StageRoute,
} from "../../lib/salesPipeline";
import { createOpportunity, putOpportunity } from "./writes";

// Putting a sales meeting on the agency's own Sales Pipeline.
//
// Stage 2 of command-center/docs/build-plans/agency-ghl-connection.md. Until
// this existed, pressing "Showed, closed" wrote a row in our database and
// nothing else: that pipeline held zero opportunities while the app quietly
// knew about every meeting.
//
// This is deliberately narrower than the cold-call push beside it. Cold Call
// writes ONE tag and lets Jake's workflows decide what it means, because a lead
// being dialled is a state his automations already act on. A sales meeting has
// no such automation: the Sales Pipeline is a board he reads by eye, and a
// board nothing ever writes to stays empty. So here the app does move the card,
// and the rules that keep that honest are:
//
//   - It only ever touches a card it created (ghl_opportunity_id on the row).
//     A card Jake made by hand is never adopted, moved or closed.
//   - It never deletes anything. Same rule as agencyCrm.ts, same reason.
//   - Nothing here throws at the caller. The meeting happened; a CRM that did
//     not catch up is recorded on the row and shown in the console, not turned
//     into a failure that loses the outcome somebody just recorded.

export interface AgencySalesPipeline {
  id: string;
  name: string;
  stages: NamedStage[];
  // Stages the console can say that this board has no column for. Empty on a
  // healthy board; non-empty is worth showing rather than discovering per press.
  missing: string[];
}

interface RawPipeline {
  id?: string;
  name?: string;
  stages?: { id?: string; name?: string }[];
}

// The Sales Pipeline, found by name on the agency account.
//
// Read live every time rather than cached. These boards are Jake's, they get
// renamed and reordered, and a stale stage id is a card dropped in the wrong
// column with nothing to indicate it happened.
export async function resolveAgencySalesPipeline(
  gctx: GhlContext,
): Promise<AgencySalesPipeline | null> {
  const data = await ghlJson<{ pipelines?: RawPipeline[] }>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const pipelines = data.pipelines ?? [];

  const wanted = SALES_PIPELINE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const match =
    pipelines.find((p) => norm(p.name ?? "") === wanted) ??
    pipelines.find((p) => norm(p.name ?? "").startsWith(wanted));
  if (!match?.id) return null;

  const stages: NamedStage[] = (match.stages ?? [])
    .filter((s): s is { id: string; name: string } => Boolean(s.id && s.name))
    .map((s) => ({ id: s.id, name: s.name }));

  return {
    id: match.id,
    name: match.name ?? SALES_PIPELINE_NAME,
    stages,
    missing: missingStages(stages),
  };
}

export interface RouteInput {
  // The card this meeting already owns, if the app has pushed it before. Null
  // means create one. A card the app did not create is never passed here.
  opportunityId: string | null;
  contactId: string;
  // What the card is called on the board. The prospect, then the business.
  name: string;
  // Null routes to Appointment Booked, which is what a meeting is before
  // anybody has run it.
  outcome: SalesCallOutcome | null;
  // Money taken on the call. Rides onto the card so the board's own totals mean
  // something; only ever sent with a close.
  cash?: number | null;
}

export type RouteResult =
  | { ok: true; opportunityId: string; stage: string; status: string }
  | { ok: false; error: string };

// Move (or create) this meeting's card so the board says what the console says.
export async function routeSalesCall(
  gctx: GhlContext,
  pipeline: AgencySalesPipeline,
  input: RouteInput,
): Promise<RouteResult> {
  const route: StageRoute = routeFor(input.outcome);
  const stage = findStage(pipeline.stages, route.stage);
  if (!stage) {
    // Named, not generic. "Could not route" sends somebody to the logs;
    // "has no Appointment Showed stage" sends them to the board, which is
    // where the fix is.
    return {
      ok: false,
      error: `The Sales Pipeline has no "${route.stage}" stage, so the card was not moved.`,
    };
  }

  const money =
    input.outcome === "closed" && typeof input.cash === "number" && input.cash > 0
      ? input.cash
      : undefined;

  try {
    if (input.opportunityId) {
      const moved = await putOpportunity(gctx, input.opportunityId, {
        pipelineId: pipeline.id,
        pipelineStageId: stage.id,
        status: route.status,
        ...(money === undefined ? {} : { monetaryValue: money }),
      });
      if (moved.ok) {
        return { ok: true, opportunityId: input.opportunityId, stage: stage.name, status: route.status };
      }
      // A card deleted in GoHighLevel is the one failure worth recovering from:
      // the meeting is still real, so make it a card again rather than leaving
      // the row pointing at nothing forever. Any other status is reported.
      if (moved.status !== 404) {
        return { ok: false, error: describeFailure(moved.status, moved.body) };
      }
    }

    const created = await createOpportunity(gctx, {
      pipelineId: pipeline.id,
      pipelineStageId: stage.id,
      contactId: input.contactId,
      name: input.name || "Sales call",
      status: route.status,
      ...(money === undefined ? {} : { monetaryValue: money }),
    });
    if (!created.ok) {
      return { ok: false, error: describeFailure(created.status, created.body) };
    }
    if (!created.id) {
      return { ok: false, error: "GoHighLevel created the card but did not say which one." };
    }
    return { ok: true, opportunityId: created.id, stage: stage.name, status: route.status };
  } catch (err) {
    return { ok: false, error: readableError(err) };
  }
}

// A GHL failure in words fit to sit under a prospect's name in the console.
function describeFailure(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "GoHighLevel refused the request. The agency token may have expired.";
  }
  if (status === 404) return "That card is no longer in GoHighLevel.";
  const detail = extractMessage(body);
  return detail ? `GoHighLevel said: ${detail}` : `GoHighLevel returned ${status}.`;
}

// GHL puts the useful sentence in `message`, sometimes as an array. Everything
// else in the body is noise nobody reading the console needs.
function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    const msg = parsed.message;
    if (typeof msg === "string") return msg.slice(0, 160);
    if (Array.isArray(msg) && typeof msg[0] === "string") return msg[0].slice(0, 160);
  } catch {
    // Not JSON. Fall through to the raw text, trimmed.
  }
  return body.trim().slice(0, 160);
}

export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split("\n")[0].slice(0, 200) || "GoHighLevel could not be reached.";
}
