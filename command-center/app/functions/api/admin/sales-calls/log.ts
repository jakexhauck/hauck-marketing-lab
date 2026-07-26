import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  isSalesOutcome,
  sanitizeDeal,
  toMoney,
  type SalesOutcome,
} from "../../../lib/salesCalls";

// PATCH /api/admin/sales-calls/log  (admin session gated in _middleware.ts;
// owner-only, since lib/adminRoles allowlists nothing under this prefix).
//
// Everything that happens on a demo call, written back to the row the calendar
// reconcile created. Three distinct moments send a PATCH here, and they are
// deliberately the same endpoint because they are all just "this is the state
// of the call now":
//
//   1. Start Call        -> started_at
//   2. Typing notes      -> sections / scratchpad, autosaved
//   3. Logging the result-> outcome, qualified, deal, cash
//
// Every field is optional. A PATCH carrying only `scratchpad` touches only
// scratchpad, so the autosave running mid-call can never clear an outcome, and
// logging an outcome can never wipe the notes underneath it.
//
// Nothing here is written back to GoHighLevel, by design. See the header of
// migration 0057 and functions/lib/agencyGhl.ts: the app records what happened,
// GHL decides what that means.

interface Body {
  id?: string;
  started?: boolean;
  ended?: boolean;
  sections?: Record<string, unknown>;
  scratchpad?: string;
  outcome?: string | null;
  qualified?: boolean | null;
  notAFitReason?: string | null;
  followUpAt?: string | null;
  deal?: unknown;
  cashCollected?: unknown;
}

const MAX_SCRATCHPAD = 20_000;
const MAX_SECTION_TEXT = 5_000;
const MAX_REASON = 500;

// Section answers as stored: a flat map of sectionId -> text. Keys are bounded
// and values are trimmed to length, so a runaway paste cannot turn one row into
// a document. Non-string values are dropped rather than coerced: "[object
// Object]" in a note somebody reads on a call is worse than a missing line.
function sanitizeSections(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const id = key.trim().slice(0, 40);
    if (!id) continue;
    out[id] = value.slice(0, MAX_SECTION_TEXT);
    if (++count >= 40) break;
  }
  return out;
}

function trimOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<Body>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const id = (body.id ?? "").trim();
  if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const admin = ctx.data.admin!;
  const now = new Date();
  const patch: Record<string, unknown> = { updated_at: now.toISOString() };

  // ---- Start / end of the call.
  //
  // started_at is stored rather than held in the component, so a call in
  // progress survives a refresh, a closed tab or a laptop that went to sleep
  // mid-conversation.
  if (body.started === true) patch.started_at = now.toISOString();
  if (body.ended === true) patch.ended_at = now.toISOString();

  // ---- The notes.
  if (body.sections !== undefined) {
    const sections = sanitizeSections(body.sections);
    if (sections === null) return Response.json({ error: "invalid_sections" }, { status: 400 });
    patch.sections = sections;
  }
  if (body.scratchpad !== undefined) {
    patch.scratchpad =
      typeof body.scratchpad === "string" ? body.scratchpad.slice(0, MAX_SCRATCHPAD) : "";
  }

  // ---- The result.
  let outcome: SalesOutcome | null | undefined;
  if (body.outcome !== undefined) {
    if (body.outcome === null) {
      outcome = null;
    } else if (isSalesOutcome(body.outcome)) {
      outcome = body.outcome;
    } else {
      // An unknown outcome is a bug in the client, not a value to store. The
      // CHECK constraint would refuse it anyway; refusing here says why.
      return Response.json({ error: "invalid_outcome" }, { status: 400 });
    }
    patch.outcome = outcome;
  }

  if (body.qualified !== undefined) {
    patch.qualified = typeof body.qualified === "boolean" ? body.qualified : null;
  }
  if (body.notAFitReason !== undefined) {
    patch.not_a_fit_reason = trimOrNull(body.notAFitReason, MAX_REASON);
  }
  if (body.followUpAt !== undefined) {
    patch.follow_up_at = isoOrNull(body.followUpAt);
  }
  if (body.deal !== undefined) {
    patch.deal = sanitizeDeal(body.deal);
  }
  if (body.cashCollected !== undefined) {
    patch.cash_collected = toMoney(body.cashCollected);
  }

  // A PATCH that carries nothing but an id is a client bug. Answering "ok" to
  // it would hide that, and the row's updated_at would move for no reason.
  if (Object.keys(patch).length === 1) {
    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  }

  // Stamp who logged it, but only on a PATCH that records a result. An autosave
  // firing while Jake types should not claim authorship of an outcome nobody
  // has chosen yet.
  if (body.outcome !== undefined) patch.logged_by = admin.id;

  const { data, error } = await client
    .from("sales_calls")
    .update(patch)
    .eq("id", id)
    .select("id, outcome, started_at, ended_at, duration_seconds, updated_at")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "call_not_found" }, { status: 404 });

  // Duration is derived once both ends are known, rather than trusted from a
  // client-side timer: a tab left open overnight would otherwise report a
  // fourteen-hour sales call.
  if (body.ended === true) {
    const row = data as { id: string; started_at?: string | null; ended_at?: string | null };
    const startMs = row.started_at ? Date.parse(row.started_at) : NaN;
    const endMs = row.ended_at ? Date.parse(row.ended_at) : NaN;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const seconds = Math.round((endMs - startMs) / 1000);
      await client.from("sales_calls").update({ duration_seconds: seconds }).eq("id", id);
      (data as Record<string, unknown>).duration_seconds = seconds;
    }
  }

  // Only a logged result is worth an audit line. Autosaved keystrokes are not.
  if (body.outcome !== undefined) {
    await logAdminAction(client, admin.id, "salescall.log", null, {
      callId: id,
      outcome: outcome ?? null,
    });
  }

  return Response.json({ ok: true, call: data });
};
