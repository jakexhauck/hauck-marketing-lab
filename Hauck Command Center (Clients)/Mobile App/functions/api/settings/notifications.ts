import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

// Per-tenant push audience rule (tenants.notify_audience), set by the owner.
//   'everyone' -> every subscribed device is notified (default).
//   'assigned' -> only the assigned rep's device, falling back to everyone when
//                 the event has no assignee or no device matches.
// GET returns the current value to any signed-in member (so the UI can render
// it); PATCH is owner-only, since it governs the whole team's alerts.

type Audience = "everyone" | "assigned";

function coerce(value: unknown): Audience {
  return value === "assigned" ? "assigned" : "everyone";
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ audience: "everyone" });

  const { data } = await client
    .from("tenants")
    .select("notify_audience")
    .eq("slug", ctx.data.tenant.slug)
    .maybeSingle();

  const audience = coerce(
    (data as { notify_audience?: string } | null)?.notify_audience,
  );
  return Response.json({ audience });
};

interface PatchBody {
  audience?: string;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  // Only the owner sets the team-wide rule. Staff get a 403 from here even if
  // they can reach Settings.
  if (ctx.data.isOwner !== true) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.audience !== "everyone" && body.audience !== "assigned") {
    return Response.json({ error: "invalid_audience" }, { status: 400 });
  }

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  const { error } = await client
    .from("tenants")
    .update({ notify_audience: body.audience })
    .eq("id", tenantId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ audience: body.audience });
};
