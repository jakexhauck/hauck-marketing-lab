import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

// Mark notifications read. Body is either { id } for a single row (tapping an
// item) or { all: true } to clear the whole feed (the "Mark all read" action).
// Idempotent: re-marking an already-read row is a no-op. Returns the fresh
// unread count so the caller can update the badge without a second round trip.
interface ReadBody {
  id?: number;
  all?: boolean;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ ok: true, unreadCount: 0 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ ok: true, unreadCount: 0 });

  let body: ReadBody = {};
  try {
    body = (await ctx.request.json()) as ReadBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // Only ever touch unread rows so read_at reflects the first time it was seen,
  // and the write stays cheap (the partial unread index does the filtering).
  let update = client
    .from("activity_log")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("read_at", null);

  if (!body.all) {
    if (typeof body.id !== "number") {
      return Response.json({ error: "id or all required" }, { status: 400 });
    }
    update = update.eq("id", body.id);
  }

  const { error } = await update;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { count } = await client
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("read_at", null);

  return Response.json({ ok: true, unreadCount: count ?? 0 });
};
