// Turning a GoHighLevel event into an activity_log row.
//
// Lifted out of api/webhook.ts unchanged, because there are now TWO endpoints
// that need it and they must never disagree about what an event means:
//
//   /api/webhook          the hand-built workflow webhook actions (legacy)
//   /api/crm/app-webhook  the Marketplace app (native events, signed)
//
// The mapping below is the legacy one, verbatim. The app-specific part of this
// file is normalizeAppEvent + APP_COVERED_TYPES at the bottom.

export interface GhlWebhookEvent {
  type?: string;
  locationId?: string;
  id?: string;
  contactId?: string;
  opportunityId?: string;
  // GHL user id the opportunity is assigned to. Drives "assigned rep only"
  // push routing; absent on events with no assignee (e.g. inbound messages).
  assignedTo?: string;
  [k: string]: unknown;
}

// Normalized activity, illustrative shape from the plan. It is mapped onto the
// real activity_log columns (action, lead_id, payload) at insert time by the
// caller.
export type ActivityKind =
  | "lead_created"
  | "stage_changed"
  | "status_changed"
  | "message_in"
  | "message_out"
  | "appointment_create"
  | "appointment_update"
  | "appointment_delete"
  | "invoice_create"
  | "invoice_sent"
  | "invoice_paid"
  | "call_inbound";

export interface Activity {
  tenant_id: string;
  kind: ActivityKind;
  contact_id: string | null;
  opportunity_id: string | null;
  // GHL user the lead is assigned to, when the event carries one. Used to route
  // "assigned rep only" pushes; null leaves the fan-out to fall back to everyone.
  assigned_user_id: string | null;
  summary: string;
  raw: unknown;
}

function mk(
  kind: ActivityKind,
  summary: string,
  tenantId: string,
  e: GhlWebhookEvent,
): Activity {
  return {
    tenant_id: tenantId,
    kind,
    contact_id: e.contactId ?? null,
    opportunity_id: e.opportunityId ?? null,
    assigned_user_id:
      typeof e.assignedTo === "string" && e.assignedTo ? e.assignedTo : null,
    summary,
    raw: e,
  };
}

// A lock-screen-worthy line for an inbound message. A bare "Inbound message"
// told the owner nothing: they had to open the app to find out whether it was
// worth stopping for. Prefer the actual text, fall back to the sender's name,
// and only then to a bare label.
//
// Both parts are best effort. GHL puts them under different keys on the
// workflow payloads Jake hand-builds and on the Marketplace app payloads, and
// neither guarantees a name, so every shape we have seen is checked and
// whatever is missing simply drops out of the line.
const MESSAGE_PREVIEW_MAX = 140;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nested(e: GhlWebhookEvent, key: string): Record<string, unknown> {
  const value = e[key];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function senderName(e: GhlWebhookEvent): string {
  const contact = nested(e, "contact");
  const full =
    str(e.full_name) ||
    str(e.fullName) ||
    str(contact.name) ||
    str(contact.fullName);
  if (full) return full;
  const first = str(e.first_name) || str(e.firstName) || str(contact.firstName);
  const last = str(e.last_name) || str(e.lastName) || str(contact.lastName);
  return [first, last].filter(Boolean).join(" ");
}

function messageText(e: GhlWebhookEvent): string {
  const message = nested(e, "message");
  const raw =
    str(e.body) || str(e.message) || str(message.body) || str(e.messageBody);
  // Collapse whitespace: a notification renders on one line, so a multi-line
  // reply or a pasted address would otherwise arrive as a run-on jumble.
  const text = raw.replace(/\s+/g, " ").trim();
  // The ellipsis counts toward the cap, so the line never exceeds it.
  return text.length > MESSAGE_PREVIEW_MAX
    ? `${text.slice(0, MESSAGE_PREVIEW_MAX - 3).trimEnd()}...`
    : text;
}

export function inboundMessageSummary(e: GhlWebhookEvent): string {
  const name = senderName(e);
  const text = messageText(e);
  if (name && text) return `${name}: ${text}`;
  return text || name || "Inbound message";
}

export function toActivity(tenantId: string, e: GhlWebhookEvent): Activity | null {
  switch (e.type) {
    case "OpportunityCreate":
      return mk("lead_created", "New lead", tenantId, e);
    case "OpportunityStageUpdate":
      return mk("stage_changed", "Stage changed", tenantId, e);
    case "OpportunityStatusUpdate": {
      // Derive a readable summary when the payload carries the new status.
      const status = typeof e.status === "string" ? e.status.toLowerCase() : "";
      const summary =
        status === "won"
          ? "Lead won"
          : status === "lost"
            ? "Lead lost"
            : "Lead status changed";
      return mk("status_changed", summary, tenantId, e);
    }
    case "LeadStatusUpdate": {
      // The type Jake's own GHL workflows post, one per status in the 12-status
      // model, carrying `status` (and `stage` for the No Answer Day N cadence,
      // which all collapse to one status). We do NOT store the status: the
      // tracker derives it from the live stage on read, so a webhook that
      // arrives late or out of order can never contradict GHL. This event exists
      // to make the app refresh instantly and to leave a readable feed row.
      const status = typeof e.status === "string" ? e.status.trim() : "";
      // A win should wake the phone, exactly like the marketplace status event.
      if (/^won\b/i.test(status)) return mk("status_changed", "Lead won", tenantId, e);
      return mk("stage_changed", status || "Stage changed", tenantId, e);
    }
    case "AppointmentCreate":
      return mk("appointment_create", "Appointment booked", tenantId, e);
    case "AppointmentUpdate":
      return mk("appointment_update", "Appointment updated", tenantId, e);
    case "AppointmentDelete":
      return mk("appointment_delete", "Appointment cancelled", tenantId, e);
    case "InvoiceCreate":
      return mk("invoice_create", "Invoice created", tenantId, e);
    case "InvoiceSent":
      return mk("invoice_sent", "Invoice sent", tenantId, e);
    case "InvoicePaid":
      return mk("invoice_paid", "Invoice paid", tenantId, e);
    case "InboundMessage":
      // A lead replied. This is the "mark thread fresh" path: it writes a
      // message_in activity row and (via shouldPush) fires a push, which is what
      // wakes the client's inbox/leads views to refetch. A fuller in-app live
      // refresh (updating an open tab without a push) would need a Supabase
      // Realtime subscription on activity_log, which does not exist yet.
      return mk("message_in", inboundMessageSummary(e), tenantId, e);
    case "OutboundMessage":
      return mk("message_out", "Outbound message", tenantId, e);
    case "InboundCall":
      // A call is hitting the business's GHL number right now. This is the
      // "pop the Call Console" path: it writes a call_inbound activity row
      // and (via shouldPush) fires a push so the client's phone wakes up.
      return mk(
        "call_inbound",
        typeof e.phone === "string" && e.phone
          ? `Incoming call ${e.phone}`
          : "Incoming call",
        tenantId,
        e,
      );
    default:
      return null; // ignore everything else
  }
}

// Kinds that wake the client's phone: work that has just arrived and needs a
// human. Everything else stays in the feed without buzzing.
//
// Inbound calls and wins are deliberately NOT here. The phone is already
// ringing for a call, so a push is a second alert for one event, and a win is
// something the owner did rather than something waiting on them.
export function shouldPush(activity: Activity): boolean {
  return (
    activity.kind === "message_in" ||
    activity.kind === "lead_created" ||
    activity.kind === "appointment_create"
  );
}

// ---------------------------------------------------------------------------
// Marketplace app specifics
// ---------------------------------------------------------------------------

// The event types the Marketplace app supersedes. A tenant switched to 'app'
// has these DROPPED on the legacy endpoint, because GHL and Jake's own workflow
// both fire for the same real-world change and the (tenant_id, ghl_event_id)
// index cannot dedupe two different ids.
//
// LeadStatusUpdate is deliberately absent: it is Jake's own 12-status cadence,
// no native GHL event emits it, and it must keep flowing through the legacy
// endpoint no matter which source a tenant is on.
export const APP_COVERED_TYPES: ReadonlySet<string> = new Set([
  "OpportunityCreate",
  "OpportunityStageUpdate",
  "OpportunityStatusUpdate",
  "AppointmentCreate",
  "AppointmentUpdate",
  "AppointmentDelete",
  "InvoiceCreate",
  "InvoiceSent",
  "InvoicePaid",
  "InboundMessage",
  "OutboundMessage",
]);

// Marketplace payloads name things differently to the custom payloads Jake
// types into a workflow's Webhook action. The big one: the subject's id arrives
// as `id`, not as `opportunityId` or `contactId`. Feed a raw app payload
// straight into toActivity and every activity row lands with a null lead_id.
//
// This maps an app payload onto the shape toActivity already understands,
// rather than teaching toActivity two dialects. Fields already in the right
// place always win, so a payload carrying both is left alone.
export function normalizeAppEvent(e: GhlWebhookEvent): GhlWebhookEvent {
  const type = typeof e.type === "string" ? e.type : "";
  const out: GhlWebhookEvent = { ...e };
  const id = typeof e.id === "string" ? e.id : "";

  if (type.startsWith("Opportunity") && !out.opportunityId && id) {
    out.opportunityId = id;
  }
  if (type.startsWith("Contact") && !out.contactId && id) {
    out.contactId = id;
  }

  // Appointments link to a contact, and the app nests it.
  const appt = (e.appointment ?? {}) as Record<string, unknown>;
  if (!out.contactId && typeof appt.contactId === "string") {
    out.contactId = appt.contactId;
  }

  // Nested objects on some app payloads (opportunity.*, contact.*).
  const opp = (e.opportunity ?? {}) as Record<string, unknown>;
  if (!out.opportunityId && typeof opp.id === "string") out.opportunityId = opp.id;
  if (!out.contactId && typeof opp.contactId === "string") {
    out.contactId = opp.contactId;
  }
  const contact = (e.contact ?? {}) as Record<string, unknown>;
  if (!out.contactId && typeof contact.id === "string") out.contactId = contact.id;

  // Assignment arrives as assignedTo on the event or on the nested opportunity.
  if (!out.assignedTo && typeof opp.assignedTo === "string") {
    out.assignedTo = opp.assignedTo;
  }

  return out;
}

// A stable id for idempotency. App payloads carry webhookId (unique per
// delivery) alongside the subject's id; the subject id alone would collapse
// two genuine stage moves on one opportunity into a single row.
export function appEventId(e: GhlWebhookEvent): string | null {
  const webhookId = e.webhookId;
  if (typeof webhookId === "string" && webhookId) return webhookId;
  // No webhookId: fall back to subject id + timestamp so retries of the SAME
  // delivery still collide while distinct changes do not. Absent both, null
  // means "insert without dedup", which is what the legacy path already does.
  const id = typeof e.id === "string" ? e.id : "";
  const at = typeof e.timestamp === "string" ? e.timestamp : "";
  if (id && at) return `${id}:${at}`;
  return null;
}
