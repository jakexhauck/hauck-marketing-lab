import type { Env } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return new Response(
      JSON.stringify({ ok: true, supabase: "unconfigured" }),
      { headers: { "content-type": "application/json" } }
    );
  }
  const { error } = await client.from("tenants").select("id").limit(1);
  return new Response(
    JSON.stringify({ ok: !error, supabase: error ? error.message : "ok" }),
    { headers: { "content-type": "application/json" } }
  );
};
