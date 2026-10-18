import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { readDirector } from "../../../lib/director";

// GET /api/admin/director -> DirectorResponse (every agent's stages and tasks)
//
// The Director and the SOPs graph both read this (lib/director.ts). Small
// enough to send whole. Owner only, checked here.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(await readDirector(client), { headers: { "Cache-Control": "no-store" } });
};
