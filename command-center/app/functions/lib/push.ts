import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
import { getServiceClient } from "./supabase";
import type { Env } from "./env";

// Shape we read back from the activity_log insert in the webhook. opportunity_id
// and contact_id drive the deep-link target of the notification; assigned_user_id
// drives "assigned rep only" routing.
export interface PushActivity {
  kind: string;
  summary: string;
  opportunity_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
}

// One row of the push_subscriptions table. The browser PushSubscription is
// stored across split columns (endpoint, p256dh, auth), not a single jsonb blob.
// ghl_user_id is the device's chosen GHL identity (the same value GHL puts in
// opportunity.assignedTo), used to route to the assigned rep.
interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  ghl_user_id: string | null;
}

// Owner-configured audience for this tenant's pushes (tenants.notify_audience).
type NotifyAudience = "everyone" | "assigned";

// Pick the subscriptions that should receive this activity given the tenant's
// audience rule. "assigned" targets only the device(s) whose chosen GHL
// identity matches the lead's assignee; it falls back to everyone when the
// event has no assignee or no subscribed device matches, so a lead is never
// silently dropped (e.g. inbound messages, which carry no assignedTo).
function selectRecipients(
  rows: SubRow[],
  audience: NotifyAudience,
  assignedUserId: string | null,
): SubRow[] {
  if (audience !== "assigned" || !assignedUserId) return rows;
  const matched = rows.filter((r) => r.ghl_user_id === assignedUserId);
  return matched.length > 0 ? matched : rows;
}

/**
 * Send a Web Push to every subscription of the given tenant when a relevant
 * activity (new message / new lead) lands. The caller resolves the tenant id
 * (the webhook routes by event.locationId). Fully inert when VAPID keys are
 * unset or Supabase is unconfigured: it simply returns early. Dead
 * subscriptions (404 / 410 from the push service) are pruned by id.
 */
export async function sendPushForActivity(
  env: Env,
  tenantId: string,
  activity: PushActivity,
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  const client = getServiceClient(env);
  if (!client) return;

  const { data: subs } = await client
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, ghl_user_id")
    .eq("tenant_id", tenantId);

  const allRows = (subs as SubRow[] | null) ?? [];
  if (allRows.length === 0) return;

  // Honour the owner's audience rule. Default to "everyone" if the column is
  // unset or unreadable: better an extra buzz than a missed lead.
  const { data: tenantRow } = await client
    .from("tenants")
    .select("notify_audience")
    .eq("id", tenantId)
    .maybeSingle();
  const audience: NotifyAudience =
    (tenantRow as { notify_audience?: string } | null)?.notify_audience ===
    "assigned"
      ? "assigned"
      : "everyone";

  const rows = selectRecipients(allRows, audience, activity.assigned_user_id);
  if (rows.length === 0) return;

  const titles: Record<string, string> = {
    lead_created: "New lead",
    message_in: "New message",
    status_changed: "Lead won",
    appointment_create: "Appointment booked",
  };
  const payloadData = JSON.stringify({
    title: titles[activity.kind] ?? activity.summary,
    body: activity.summary,
    url: activity.opportunity_id
      ? `/lead/${activity.opportunity_id}`
      : activity.contact_id
        ? `/conversations/${activity.contact_id}`
        : "/",
  });

  const vapid = {
    subject: "mailto:jake@hauckmarketing.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  await Promise.all(
    rows.map(async (row) => {
      // Reconstruct the browser PushSubscription shape from the split columns.
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };

      try {
        const payload = await buildPushPayload(
          { data: payloadData, options: { ttl: 60 } },
          subscription,
          vapid,
        );
        const res = await fetch(row.endpoint, payload);
        // 404 / 410 mean the subscription is dead. Prune it so we stop trying.
        if (res.status === 404 || res.status === 410) {
          await client.from("push_subscriptions").delete().eq("id", row.id);
        }
      } catch (err) {
        console.error("[push] send failed for", row.id, err);
      }
    }),
  );
}
