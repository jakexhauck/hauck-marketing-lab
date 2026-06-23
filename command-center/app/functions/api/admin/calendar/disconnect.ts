import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// POST /api/admin/calendar/disconnect — forget the connected Google account.
// Work blocks stay; they just stop mirroring. Admin-only.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { error } = await supabase.from("calendar_connection").delete().eq("id", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
