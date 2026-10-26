import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson } from "../../../../../../lib/ghl";
import { buildCalendarUpdate, parseCalendarPatch, shapeCalendar } from "../../../../../../lib/ghlSetup";
import { fail, loc, setupCtx } from "../_shared";

// PUT /api/admin/clients/:tenantId/ghl-setup/calendars/:calendarId  CalendarPatch -> { calendar }
//
// Read-modify-write (lib/ghlSetup.ts buildCalendarUpdate): the calendar is read
// fresh, its own slot settings carried back, and only the edit changes.

type Row = Record<string, unknown>;

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const patch = parseCalendarPatch(await ctx.request.json().catch(() => null));
  if (typeof patch === "string") return Response.json({ error: patch }, { status: 400 });
  const id = encodeURIComponent(ctx.params.calendarId as string);
  try {
    const current = ((await ghlJson<Row>(s.g, `/calendars/${id}`)).calendar ?? {}) as Row;
    // A calendar id from another sub-account must not be writable through this one.
    if (current.locationId !== s.g.locationId) return Response.json({ error: "That calendar is not on this account." }, { status: 404 });
    if (patch.team) {
      const users = new Set(((await ghlJson<{ users?: Row[] }>(s.g, `/users/?locationId=${loc(s.g)}`)).users ?? []).map((u) => u.id));
      if (patch.team.some((u) => !users.has(u))) return Response.json({ error: "Every team member must be a user on this account." }, { status: 400 });
    }
    const saved = await ghlJson<Row>(s.g, `/calendars/${id}`, { method: "PUT", body: JSON.stringify(buildCalendarUpdate(current, patch)) });
    return Response.json({ calendar: shapeCalendar((saved.calendar ?? current) as Row) });
  } catch (err) {
    return fail(err);
  }
};
