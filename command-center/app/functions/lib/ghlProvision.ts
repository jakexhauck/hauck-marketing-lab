import { ghlJson, type GhlContext } from "./ghl";
import { PHONE_APPT_CALL_PURPOSE, linkKey } from "./callNow";
import { OUTCOME_KEY_PURPOSE } from "./estimateOutcome";
import { LEAD_KEY_PURPOSE } from "./leadOutcome";
import { OUTCOME_LINK_PURPOSE } from "./outcome";

// Everything the Connection page's Provision button writes INTO a client's
// GoHighLevel sub-account.
//
// Deliberately small. The API cannot create workflows (there is no
// POST /workflows), so this cannot build the automations for you. What it can
// do is put the pieces those automations reference in place, so building one is
// picking a custom value from a dropdown rather than pasting a URL and a secret
// by hand into every action.
//
// Idempotent by name: it reads first and only writes what is missing or wrong,
// so the button is safe to press repeatedly.
//
// It used to create a "facebook ads" tag too. Gone 2026-09-23: every client is
// ads-only, so ad revenue counts every Job Completed and no tag is needed.

export interface ProvisionItem {
  kind: "custom_value";
  name: string;
  // "created" | "updated" | "already correct" | "failed: <reason>"
  outcome: string;
}

interface CustomValue {
  id: string;
  name: string;
  value: string;
}

// The custom value every hand-built workflow's Webhook action should point at,
// so the URL and its secret live in ONE place per sub-account. Changing the
// secret then means re-running Provision, not editing every workflow.
//
// Yes, this stores the shared webhook secret inside the client's GHL account.
// That is exactly where it lives today, pasted into each workflow action by
// hand; this makes it one copy instead of fourteen.
export const WEBHOOK_URL_VALUE_NAME = "Command Center Webhook URL";

async function upsertCustomValue(
  gctx: GhlContext,
  name: string,
  value: string,
): Promise<ProvisionItem> {
  try {
    const existing = await ghlJson<{ customValues?: CustomValue[] }>(
      gctx,
      `/locations/${encodeURIComponent(gctx.locationId)}/customValues`,
    );
    const match = (existing.customValues ?? []).find(
      (v) => v.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (match && match.value === value) {
      return { kind: "custom_value", name, outcome: "already correct" };
    }
    if (match) {
      await ghlJson(
        gctx,
        `/locations/${encodeURIComponent(gctx.locationId)}/customValues/${encodeURIComponent(match.id)}`,
        { method: "PUT", body: JSON.stringify({ name, value }) },
      );
      return { kind: "custom_value", name, outcome: "updated" };
    }
    await ghlJson(
      gctx,
      `/locations/${encodeURIComponent(gctx.locationId)}/customValues`,
      { method: "POST", body: JSON.stringify({ name, value }) },
    );
    return { kind: "custom_value", name, outcome: "created" };
  } catch (err) {
    return { kind: "custom_value", name, outcome: `failed: ${(err as Error).message}` };
  }
}

// The owner links texted by the snapshot's workflows, each with this client's
// key already in it, so the workflow text is identical in every sub-account:
//
//   Tap to call: {{custom_values.call_now_link}}&c={{contact.id}}
//   How did it go? {{custom_values.estimate_outcome_link}}&c={{contact.id}}
//   Log outcome: {{custom_values.lead_outcome_link}}&c={{contact.id}}
//   Phone appointment: {{custom_values.phone_appointment_call_now_link}}&c={{contact.id}}
//   What happened? {{custom_values.outcome_link}}&c={{contact.id}}
//
// GoHighLevel derives the merge key from the name, so these names are the
// contract with the snapshot. Do not rename them.
export const CALL_NOW_LINK_NAME = "Call Now Link";
export const ESTIMATE_OUTCOME_LINK_NAME = "Estimate Outcome Link";
export const LEAD_OUTCOME_LINK_NAME = "Lead Outcome Link";
export const PHONE_APPT_CALL_LINK_NAME = "Phone Appointment Call Now Link";
// The universal outcome page (lib/outcome.ts); the two outcome links above open
// the same page.
export const OUTCOME_LINK_NAME = "Outcome Link";

const LIVE_ORIGIN = "https://app.hauckmarketing.com";

// One owner link as Client > GHL > Wiring shows it.
export interface WiringLink {
  name: string;
  // The merge tag a workflow uses, e.g. {{custom_values.call_now_link}}.
  merge: string;
  value: string;
}

// GoHighLevel's own rule for a custom value's merge key: lowercase, spaces to
// underscores.
export function mergeTag(name: string): string {
  return `{{custom_values.${name.trim().toLowerCase().replace(/\s+/g, "_")}}}`;
}

export async function ownerLinkValues(
  origin: string,
  secret: string,
  locationId: string,
): Promise<{ name: string; value: string }[]> {
  const l = encodeURIComponent(locationId);
  // A press on localhost must not text a client's owner a localhost link.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)) origin = LIVE_ORIGIN;
  return [
    {
      name: CALL_NOW_LINK_NAME,
      value: `${origin}/api/call-now?l=${l}&k=${await linkKey(secret, "call-now", locationId)}`,
    },
    {
      name: ESTIMATE_OUTCOME_LINK_NAME,
      value: `${origin}/api/estimate-outcome?l=${l}&k=${await linkKey(secret, OUTCOME_KEY_PURPOSE, locationId)}`,
    },
    {
      name: LEAD_OUTCOME_LINK_NAME,
      value: `${origin}/api/lead-outcome?l=${l}&k=${await linkKey(secret, LEAD_KEY_PURPOSE, locationId)}`,
    },
    {
      name: PHONE_APPT_CALL_LINK_NAME,
      value: `${origin}/api/phone-appt-call?l=${l}&k=${await linkKey(secret, PHONE_APPT_CALL_PURPOSE, locationId)}`,
    },
    {
      name: OUTCOME_LINK_NAME,
      value: `${origin}/api/outcome?l=${l}&k=${await linkKey(secret, OUTCOME_LINK_PURPOSE, locationId)}`,
    },
  ];
}

// Just the owner links, for the Provision button (which does not touch the
// webhook URL).
export async function provisionOwnerLinks(
  gctx: GhlContext,
  origin: string,
  secret: string,
): Promise<ProvisionItem[]> {
  if (!secret) return [];
  const out: ProvisionItem[] = [];
  for (const v of await ownerLinkValues(origin, secret, gctx.locationId)) {
    out.push(await upsertCustomValue(gctx, v.name, v.value));
  }
  return out;
}

// Run every provision step. Each step reports its own outcome rather than the
// whole run failing on the first error.
export async function provisionLocation(
  gctx: GhlContext,
  webhookUrl: string,
  links?: { origin: string; secret: string },
): Promise<ProvisionItem[]> {
  const out = [await upsertCustomValue(gctx, WEBHOOK_URL_VALUE_NAME, webhookUrl)];
  if (links) out.push(...(await provisionOwnerLinks(gctx, links.origin, links.secret)));
  return out;
}
