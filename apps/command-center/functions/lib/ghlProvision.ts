import { ghlJson, type GhlContext } from "./ghl";
import { shortCode } from "./ownerShortLink";
import { LEAD_KEY_PURPOSE } from "./leadOutcome";

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

// The one owner link texted by the snapshot's new-lead workflow, with this
// client's key already in it, so the workflow text is identical in every
// sub-account:
//
//   Open lead: {{custom_values.open_lead}}&c={{contact.id}}
//
// GoHighLevel derives the merge key from the name, so this name is the
// contract with the snapshot. Do not rename it.
export const OPEN_LEAD_LINK_NAME = "Open Lead";

const LIVE_ORIGIN = "https://app.hauckmarketing.com";

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
  // A press on localhost must not text a client's owner a localhost link.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin)) origin = LIVE_ORIGIN;
  // Jake, 2026-10-10: three custom values, no more. Estimate Outcome Link and
  // Outcome Link are no longer written; their routes stay up so links already
  // texted keep opening.
  // Jake, 2026-10-12: the short form (lib/ownerShortLink.ts). It already has a
  // query string, so the text's "&c={{contact.id}}" still appends cleanly. The
  // long /api/call-now?l=..&k=.. links stay valid.
  // Jake, 2026-10-12, later: one link only, Open Lead. It opens the outcome
  // page, which now has the Call button, so Call Now Link, Lead Outcome Link,
  // Phone Appointment Call Now Link and Text Them Link are no longer written.
  // Open Lead carries the Lead Outcome key, so it is the same link Lead Outcome
  // Link already holds, and every value already in GHL keeps working.
  return [
    {
      name: OPEN_LEAD_LINK_NAME,
      value: `${origin}/api/n?o=${await shortCode(secret, LEAD_KEY_PURPOSE, locationId)}`,
    },
  ];
}

// Just the owner links (today only Open Lead). Written with no button press
// (Jake, 2026-10-14: the Outcome Wiring page went): on link, and on every
// Custom Values and Accounts load. Idempotent: one read, and a write only when
// the value is missing or wrong.
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
