import type { Env } from "../lib/env";
import { admin } from "../lib/supabase-admin";

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

interface GhlWebhookEvent {
  type?: string;
  locationId?: string;
  id?: string;
  contactId?: string;
  opportunityId?: string;
  pipelineStageId?: string;
  [k: string]: unknown;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const raw = await ctx.request.text();
  const signature =
    ctx.request.headers.get("x-ghl-signature") ||
    ctx.request.headers.get("x-webhook-signature") ||
    "";

  if (ctx.env.WEBHOOK_SECRET) {
    const expected = await hmacHex(ctx.env.WEBHOOK_SECRET, raw);
    if (!timingSafeEqual(expected, signature.toLowerCase())) {
      console.warn("[webhook] signature mismatch");
    }
  }

  let event: GhlWebhookEvent = {};
  try {
    event = JSON.parse(raw);
  } catch {
    console.warn("[webhook] non-json body");
  }

  const locationId = event.locationId;
  let tenantId: string | null = null;
  if (locationId) {
    const { data } = await admin(ctx.env)
      .from("tenants")
      .select("id")
      .eq("ghl_location_id", locationId)
      .maybeSingle();
    tenantId = (data?.id as string | undefined) ?? null;
  }

  if (tenantId) {
    await admin(ctx.env).from("activity_log").insert({
      tenant_id: tenantId,
      action: `webhook.${event.type ?? "unknown"}`,
      lead_id: (event.opportunityId as string) ?? null,
      payload: event,
    });
  }

  console.log("[webhook]", event.type ?? "unknown", "tenant:", tenantId ?? "none");
  return new Response("ok", { status: 200 });
};
