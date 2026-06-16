import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
import { getServiceClient } from "./supabase";
import type { Env } from "./env";

// Shape we read back from the activity_log insert in the webhook. opportunity_id
// and contact_id drive the deep-link target of the notification.
export interface PushActivity {
  kind: string;
  summary: string;
  opportunity_id: string | null;
  contact_id: string | null;
}

// One row of the push_subscriptions table. The browser PushSubscription is
// stored across split columns (endpoint, p256dh, auth), not a single jsonb blob.
interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
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
    .select("id, endpoint, p256dh, auth")
    .eq("tenant_id", tenantId);

  const rows = (subs as SubRow[] | null) ?? [];
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
