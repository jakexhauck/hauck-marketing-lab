import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { sweepBookedFromColdSms } from "../../../lib/coldSmsAgency";

// POST /api/admin/cold-sms/sweep-booked  (owner only)
//
// Called by the board once it has loaded: deletes the Cold SMS card of every
// prospect who has been booked (has a Sales pipeline card), however they were
// booked (Jake, 2026-10-13). Own request so it never slows the board read or
// eats into its outside-call budget. See sweepBookedFromColdSms.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  const db = getServiceClient(ctx.env);
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  try {
    return Response.json(await sweepBookedFromColdSms(db, getAgencyGhlContext(ctx.env)));
  } catch (err) {
    console.error("[cold-sms/sweep-booked]", err instanceof Error ? err.message : err);
    return Response.json({ error: "sweep_failed" }, { status: 502 });
  }
};
