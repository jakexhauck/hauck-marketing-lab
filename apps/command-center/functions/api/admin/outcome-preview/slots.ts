import type { Env, ApiData } from "../../../lib/env";
import { dateStringInZone, zonedTimeToUtcMs } from "../../../lib/tz";

// GET /api/admin/outcome-preview/slots?cal=estimate|job -> sample open times for
// the preview. Estimates every two hours, jobs mornings and one afternoon.

const ZONE = "America/Detroit";
const TIMES = { estimate: ["08:00", "10:00", "12:00", "14:00", "16:00"], job: ["08:00", "10:00", "13:00"] };

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const cal = new URL(ctx.request.url).searchParams.get("cal") === "job" ? "job" : "estimate";
  const now = Date.now();
  const days = Array.from({ length: 10 }, (_, i) => dateStringInZone(ZONE, now + (i + 1) * 86_400_000)).map((date) => ({
    date,
    slots: TIMES[cal].flatMap((t) => {
      const ms = zonedTimeToUtcMs(ZONE, date, Number(t.slice(0, 2)), 0);
      if (ms === null) return [];
      // "2026-10-14T09:00:00-04:00", the shape the real slots endpoint returns.
      return [`${date}T${t}:00${offset(ms)}`];
    }),
  }));
  return Response.json({ days });
};

// The zone's UTC offset at an instant, as "-04:00".
function offset(ms: number): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "longOffset" })
    .formatToParts(ms)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}:\d{2})/.exec(part ?? "");
  return m ? m[1] : "Z";
}
