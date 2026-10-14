import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import type { ActivityRow } from "../activity";

// The notification center reads the same activity_log rows the webhook writes
// (see functions/api/webhook.ts), but adds read state: each row carries a
// read_at (null = unread) and the response includes the unread count for the
// bell badge. Degrades to an empty, zero-unread feed when Supabase is not
// configured, so the app still renders without a backend.
export interface NotificationRow extends ActivityRow {
  read_at: string | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ notifications: [], unreadCount: 0 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ notifications: [], unreadCount: 0 });

  const [feed, unread] = await Promise.all([
    client
      .from("activity_log")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("read_at", null),
  ]);

  return Response.json({
    notifications: (feed.data as NotificationRow[] | null) ?? [],
    unreadCount: unread.count ?? 0,
  });
};
