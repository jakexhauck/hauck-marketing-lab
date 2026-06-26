import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

// Per-person progress through the client product tour. Scoped to the session's
// tenant (set in _middleware.ts); person_key buckets within it.
//
// person_key precedence: a staff session IS a real person, so its staff id is
// authoritative and the client-supplied key is ignored. An owner
// (shared-password) session has no staff row, so it passes its chosen GHL
// identity id (falling back to "owner"). The key never grants access on its
// own: the middleware already authenticated the tenant.

function personKeyFor(ctx: { data: ApiData }, supplied: string | null): string {
  const staffId = ctx.data.staff?.id;
  if (staffId) return `staff:${staffId}`;
  const key = (supplied ?? "").trim();
  return key ? `id:${key}` : "owner";
}

// GET /api/me/tour?personKey=<owner identity id>
// -> { completedVersion: number | null, unavailable?: true }
// null  = no row yet (this person has never finished the tour).
// number = the highest tour version they have completed.
// unavailable = Supabase not configured; the client suppresses the tour rather
// than running it every login with no way to persist completion.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ completedVersion: null, unavailable: true });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ completedVersion: null, unavailable: true });

  const url = new URL(ctx.request.url);
  const personKey = personKeyFor(ctx, url.searchParams.get("personKey"));

  const { data, error } = await client
    .from("tour_progress")
    .select("completed_version")
    .eq("tenant_id", tenantId)
    .eq("person_key", personKey)
    .maybeSingle();

  if (error) return Response.json({ completedVersion: null, unavailable: true });
  const completedVersion =
    data && typeof data.completed_version === "number" ? data.completed_version : null;
  return Response.json({ completedVersion });
};

// POST /api/me/tour  body { personKey?: string, version: number }
// Records that this person has now completed the tour up to `version`. Upserts
// to max(existing, version) so a "what's new" run can never roll progress back.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ ok: true, unavailable: true });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ ok: true, unavailable: true });

  const body = (await ctx.request.json().catch(() => null)) as
    | { personKey?: string; version?: number }
    | null;
  const version = Math.trunc(Number(body?.version));
  if (!Number.isFinite(version) || version < 0) {
    return Response.json({ error: "invalid version" }, { status: 400 });
  }
  const personKey = personKeyFor(ctx, body?.personKey ?? null);

  // Read-then-write the max. Two devices finishing at once is harmless: both
  // land on the same value, and the highest always wins.
  const { data: existing } = await client
    .from("tour_progress")
    .select("completed_version")
    .eq("tenant_id", tenantId)
    .eq("person_key", personKey)
    .maybeSingle();
  const prev =
    existing && typeof existing.completed_version === "number"
      ? existing.completed_version
      : 0;
  const next = Math.max(prev, version);

  const { error } = await client.from("tour_progress").upsert(
    {
      tenant_id: tenantId,
      person_key: personKey,
      completed_version: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,person_key" },
  );
  if (error) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ ok: true, completedVersion: next });
};
