import type { Env } from "../../lib/env";
import { getFreeSlots } from "../lib/appointments";
import { resolveOutcomeLink } from "../../lib/estimateOutcomeLink";

// GET /api/estimate-outcome/slots?l=..&c=..&k=..&cal=job|estimate  (public, own key)
//   -> { days: [{ date, slots: [iso] }] }
//
// Open times for the outcome page: the Job calendar for a Sold, the estimate
// calendar for a Rescheduled. Three weeks out, in the client's zone.

const DAYS_AHEAD = 21;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const link = await resolveOutcomeLink(ctx.env, url);
  if ("message" in link) return Response.json({ error: link.message }, { status: link.status });

  const which = url.searchParams.get("cal");
  const calendar = which === "job" ? link.calendars.job : which === "estimate" ? link.calendars.estimate : null;
  if (!calendar) return Response.json({ days: [] });

  const now = Date.now();
  const result = await getFreeSlots(link.gctx, calendar.id, now, now + DAYS_AHEAD * 86_400_000, link.zone);
  if (!result.ok) return Response.json({ days: [], error: "Could not load times." }, { status: 502 });
  return Response.json({ days: result.days }, { headers: { "cache-control": "no-store" } });
};
