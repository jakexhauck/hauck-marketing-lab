import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
import { getServiceClient } from "./supabase";
import { ghlJson } from "./ghl";
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

// What GHL's conversation search gives us about a contact's thread.
interface ConversationRow {
  contactId?: string;
  fullName?: string;
  contactName?: string;
  lastMessageBody?: string;
  lastMessageDirection?: string;
}

const MESSAGE_PREVIEW_MAX = 140;

/**
 * Say who wrote and what they said, for an inbound message.
 *
 * GHL's InboundMessage webhook carries only type, contactId and locationId:
 * no name, no text. "New message" alone forces the owner to open the app to
 * learn whether it was worth stopping for, so we spend one GHL call to fill it
 * in. Returns null when there is nothing better than the caller's fallback.
 *
 * The catch: lastMessageBody is the NEWEST message on the thread, which is not
 * always the one that woke us. An instant auto-reply overtakes the lead's text
 * within the same second, and quoting our own automation back at the owner is
 * worse than saying nothing. So the text is used only while GHL still reports
 * the thread as inbound; otherwise the name goes out on its own.
 */
async function describeInboundMessage(
  ctx: { token: string; locationId: string },
  contactId: string,
): Promise<string | null> {
  try {
    const data = await ghlJson<{ conversations?: ConversationRow[] }>(
      ctx,
      `/conversations/search?locationId=${encodeURIComponent(ctx.locationId)}&contactId=${encodeURIComponent(contactId)}`,
    );
    const convs = data.conversations ?? [];
    const conv =
      convs.find((c) => c.contactId === contactId) ?? convs[0] ?? null;
    if (!conv) return null;

    const name = (conv.fullName ?? conv.contactName ?? "").trim();
    const inbound = conv.lastMessageDirection === "inbound";
    const body = inbound ? (conv.lastMessageBody ?? "").trim() : "";
    const text = body.replace(/\s+/g, " ").trim();
    const preview =
      text.length > MESSAGE_PREVIEW_MAX
        ? `${text.slice(0, MESSAGE_PREVIEW_MAX - 3).trimEnd()}...`
        : text;

    if (name && preview) return `${name}: ${preview}`;
    return preview || name || null;
  } catch {
    // A slow or unhappy GHL must never cost the owner the notification itself.
    return null;
  }
}

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

  const { data: tenantRow } = await client
    .from("tenants")
    .select(
      "notify_audience, notify_push_enabled, ghl_token, ghl_location_id",
    )
    .eq("id", tenantId)
    .maybeSingle();
  const prefs = tenantRow as {
    notify_audience?: string;
    notify_push_enabled?: boolean | null;
    ghl_token?: string | null;
    ghl_location_id?: string | null;
  } | null;

  // The owner's master push switch (0021). Only an explicit false silences the
  // tenant: an unset or unreadable column means push stays on, because a missed
  // lead costs more than an extra buzz.
  if (prefs?.notify_push_enabled === false) return;

  // Honour the owner's audience rule, defaulting to "everyone" on the same
  // reasoning.
  const audience: NotifyAudience =
    prefs?.notify_audience === "assigned" ? "assigned" : "everyone";

  const rows = selectRecipients(allRows, audience, activity.assigned_user_id);
  if (rows.length === 0) return;

  // One title per kind shouldPush lets through. The body carries the detail:
  // for a message that is the sender and their text, so the owner can judge
  // from the lock screen whether to stop what they are doing.
  const titles: Record<string, string> = {
    lead_created: "New lead",
    message_in: "New message",
    appointment_create: "Appointment booked",
  };
  // Fill in the sender and their words when the webhook did not carry them.
  // Only worth a call for a message: a new lead and a booked appointment both
  // already say everything the owner needs.
  let body = activity.summary;
  if (activity.kind === "message_in" && activity.contact_id && prefs?.ghl_token) {
    const described = await describeInboundMessage(
      { token: prefs.ghl_token, locationId: prefs.ghl_location_id ?? "" },
      activity.contact_id,
    );
    if (described) body = described;
  }

  const payloadData = JSON.stringify({
    title: titles[activity.kind] ?? activity.summary,
    body,
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
