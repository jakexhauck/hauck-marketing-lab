import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  sanitizeNoteSections,
  DEFAULT_NOTE_SECTIONS,
  type NoteSection,
} from "../../../lib/salesCalls";

// GET/PATCH /api/admin/sales-calls/settings  (admin session gated in
// _middleware.ts; owner-only, since lib/adminRoles allowlists nothing here).
//
// Two settings, both about how the agency sells rather than about a client:
//
//   demo_calendar_id    which agency calendar holds demo calls
//   call_note_sections  the guided prompts on the call workspace
//
// The calendar is a setting and not a constant because getting it wrong is
// visible and bad: the agency account also carries an Onboarding calendar that
// a personal Google account syncs flight bookings into. Picking the wrong one
// puts a flight to Atlanta on the page with a Start Call button next to it.
//
// One row, pinned to id='agency', matching cold_call_script (migration 0048).

const ROW_ID = "agency";
const SELECT = "demo_calendar_id, call_note_sections, updated_at";

interface SettingsRow {
  demo_calendar_id: string | null;
  call_note_sections: unknown;
  updated_at: string | null;
}

// Stored sections, falling back to the defaults when the row has never been
// written or holds something malformed. The page always has prompts to render,
// so a bad write can never leave Jake with a notes panel of nothing.
function readSections(raw: unknown): NoteSection[] {
  const stored = sanitizeNoteSections(raw);
  return stored.length ? stored : DEFAULT_NOTE_SECTIONS;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data, error } = await client
    .from("agency_settings")
    .select(SELECT)
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const row = data as SettingsRow | null;
  // Never a 404: a settings row that does not exist yet is "nothing chosen",
  // which is a state the page renders rather than an error it handles.
  return Response.json({
    demoCalendarId: row?.demo_calendar_id ?? null,
    noteSections: readSections(row?.call_note_sections),
    updatedAt: row?.updated_at ?? null,
  });
};

interface Body {
  demoCalendarId?: string | null;
  noteSections?: unknown;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  // The role allowlist already refuses a non-owner anywhere under this prefix.
  // This is the second lock on the same door, matching cold-call/script.ts.
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await readJsonBody<Body>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase_not_configured" }, { status: 503 });

  const patch: Record<string, unknown> = {
    id: ROW_ID,
    updated_at: new Date().toISOString(),
    updated_by: ctx.data.admin!.id,
  };

  if (body.demoCalendarId !== undefined) {
    const id = typeof body.demoCalendarId === "string" ? body.demoCalendarId.trim() : "";
    // Empty clears the choice rather than storing "". The page distinguishes
    // "no calendar chosen" from "a calendar chosen badly", and only null reads
    // as the first.
    patch.demo_calendar_id = id || null;
  }

  if (body.noteSections !== undefined) {
    const sections = sanitizeNoteSections(body.noteSections);
    // Refuse an empty list rather than storing one. A notes panel with no
    // prompts is not a preference, it is a page that lost its purpose, and the
    // GET's fallback would silently undo the save anyway.
    if (!sections.length) {
      return Response.json({ error: "no_sections" }, { status: 400 });
    }
    patch.call_note_sections = sections;
  }

  if (Object.keys(patch).length === 3) {
    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { data, error } = await client
    .from("agency_settings")
    .upsert(patch, { onConflict: "id" })
    .select(SELECT)
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message ?? "could_not_save" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "salescall.settings.update", null, {
    changedCalendar: body.demoCalendarId !== undefined,
    changedSections: body.noteSections !== undefined,
  });

  const row = data as SettingsRow;
  return Response.json({
    demoCalendarId: row.demo_calendar_id ?? null,
    noteSections: readSections(row.call_note_sections),
    updatedAt: row.updated_at ?? null,
  });
};
