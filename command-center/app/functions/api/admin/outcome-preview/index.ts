import type { Env, ApiData } from "../../../lib/env";
import { STAGE_LABEL, outcomePage, parseOutcomeBody } from "../../../lib/outcome";
import { PREVIEW_FORM, callBackDays, noAnswerDue } from "../../lib/outcomeHandlers";

// GET  /api/admin/outcome-preview  -> the universal outcome page on a sample lead
// POST /api/admin/outcome-preview  -> what Save would say. Nothing is saved.
//
// For the admin Outcome Page (Operations > Outcome Page). Admin only, upstream.

const ZONE = "America/Detroit";

const clock = (ms: number) =>
  new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(ms);

export const onRequestGet: PagesFunction<Env, string, ApiData> = async () => {
  const now = Date.now();
  return new Response(
    outcomePage({
      name: "Marcus Bell",
      booked: "",
      current: "",
      base: "/api/admin/outcome-preview",
      query: "?preview=1",
      hasJobCalendar: true,
      form: PREVIEW_FORM,
      ...callBackDays(ZONE, now),
      noAnswerAt: clock(noAnswerDue(now)),
    }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const input = parseOutcomeBody(await ctx.request.json().catch(() => null));
  if ("error" in input) return Response.json({ ok: false, error: input.error }, { status: 400 });
  const extra =
    input.outcome === "no_answer"
      ? ` We'll text you tomorrow at ${clock(noAnswerDue(Date.now()))} to call again.`
      : input.outcome === "not_interested"
        ? ` ${input.reason}.`
        : "";
  return Response.json({ ok: true, message: `Preview only, nothing saved. Moved to ${STAGE_LABEL[input.outcome]}.${extra}` });
};
