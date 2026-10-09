import type { Env } from "../../lib/env";
import { getFreeSlots } from "../lib/appointments";
import { resolveOutcomeLink } from "../../lib/estimateOutcomeLink";
import { LEAD_KEY_PURPOSE } from "../../lib/leadOutcome";

// GET /api/lead-outcome/slots?l=..&c=..&k=..  (public, own key)
//   -> { days: [{ date, slots: [iso] }] }
//
// Open estimate times for the new-lead page. Three weeks out, client's zone.

const DAYS_AHEAD = 21;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const link = await resolveOutcomeLink(ctx.env, new URL(ctx.request.url), LEAD_KEY_PURPOSE);
  if ("message" in link) return Response.json({ error: link.message }, { status: link.status });

  const now = Date.now();
  const result = await getFreeSlots(
    link.gctx,
    link.calendars.estimate.id,
    now,
    now + DAYS_AHEAD * 86_400_000,
    link.zone,
  );
  if (!result.ok) return Response.json({ days: [], error: "Could not load times." }, { status: 502 });
  return Response.json({ days: result.days }, { headers: { "cache-control": "no-store" } });
};
