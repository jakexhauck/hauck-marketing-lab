import type { Env } from "../lib/env";
import { readToken, tokenMatches } from "../lib/webhookAuth";

// Relay internal-notification emails from GHL workflows through the app so they
// send from the agency's own domain (alerts@hauckmarketing.com) via Resend,
// instead of GHL's sender. GHL keeps authoring the message; a workflow "Webhook"
// action POSTs the finished (merge-fields-resolved) content here:
//
//   POST https://app.hauckmarketing.com/api/internal-notify?token=<WEBHOOK_SECRET>
//   { "to": "staff@co.com", "subject": "New lead: Jane", "html": "<p>...</p>" }
//
// Auth reuses WEBHOOK_SECRET (same GHL -> app trust boundary as /api/webhook).
// The From address is locked server-side: the caller controls to/subject/body
// but can only ever send AS us, so a leaked token cannot spoof arbitrary senders.

const DEFAULT_FROM = "Hauck Marketing Alerts <alerts@hauckmarketing.com>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface NotifyPayload {
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  // Message content. Prefer `html`; `text` for plain; `body` is an alias for
  // `html` so a GHL payload can use whichever field is convenient.
  html?: string;
  text?: string;
  body?: string;
  // Optional: set the Reply-To so staff can reply straight to the lead.
  replyTo?: string;
  // Optional, logged only, for tracing which sub-account fired the alert.
  locationId?: string;
}

// Split a comma/semicolon-separated string (or pass an array through) into a
// clean list of non-empty recipients. Returns [] when nothing usable is given.
function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : value.split(/[,;]/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Very light sanity check: a recipient must look like an address. Not full
// RFC validation, just enough to reject obvious garbage before hitting Resend.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.WEBHOOK_SECRET) {
    console.error("[internal-notify] WEBHOOK_SECRET not configured; rejecting");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const token = readToken(ctx.request);
  if (!token || !(await tokenMatches(token, ctx.env.WEBHOOK_SECRET))) {
    console.warn("[internal-notify] rejected: bad or missing token");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!ctx.env.RESEND_API_KEY) {
    console.error("[internal-notify] RESEND_API_KEY not configured; rejecting");
    return Response.json({ error: "email_not_configured" }, { status: 503 });
  }

  let payload: NotifyPayload;
  try {
    payload = (await ctx.request.json()) as NotifyPayload;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const to = toList(payload.to);
  const cc = toList(payload.cc);
  const subject = (payload.subject ?? "").trim();
  const html = payload.html ?? payload.body;
  const text = payload.text;

  const invalid = to.filter((addr) => !looksLikeEmail(addr));
  if (to.length === 0 || invalid.length > 0) {
    return Response.json(
      { error: "invalid_recipient", detail: invalid },
      { status: 400 },
    );
  }
  if (!subject) {
    return Response.json({ error: "missing_subject" }, { status: 400 });
  }
  if (!html && !text) {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }

  const message: Record<string, unknown> = {
    from: ctx.env.NOTIFY_FROM || DEFAULT_FROM,
    to,
    subject,
  };
  if (cc.length > 0) message.cc = cc;
  if (html) message.html = html;
  if (text) message.text = text;
  if (payload.replyTo && looksLikeEmail(payload.replyTo.trim())) {
    message.reply_to = payload.replyTo.trim();
  }

  console.log(
    "[internal-notify]",
    "to:",
    to.length,
    "location:",
    payload.locationId ?? "none",
  );

  // Send through Resend. Unlike /api/webhook (best-effort activity logging that
  // always acks 200 to stop retries), a failed notification is a real failure
  // worth surfacing: GHL workflow webhook actions fire once and do not
  // retry-hammer, so returning the true status just makes failures visible in
  // the workflow's execution log.
  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error("[internal-notify] resend request failed", err);
    return Response.json({ error: "send_failed" }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[internal-notify] resend rejected", res.status, detail);
    return Response.json({ error: "send_rejected" }, { status: 502 });
  }

  const { id } = (await res.json().catch(() => ({}))) as { id?: string };
  return Response.json({ ok: true, id: id ?? null }, { status: 200 });
};
