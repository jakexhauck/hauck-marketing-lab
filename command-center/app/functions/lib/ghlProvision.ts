import { ghlJson, type GhlContext } from "./ghl";

// Everything the Connection page's Provision button writes INTO a client's
// GoHighLevel sub-account.
//
// Deliberately small. The API cannot create workflows (there is no
// POST /workflows), so this cannot build the automations for you. What it can
// do is put the pieces those automations reference in place, so building one is
// picking a custom value from a dropdown rather than pasting a URL and a secret
// by hand into every action.
//
// Idempotent by name: everything reads first and only writes what is missing or
// wrong, so the button is safe to press repeatedly.

export interface ProvisionItem {
  kind: "custom_value" | "tag";
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

// Tags the app's own reads depend on. The paid-ads revenue join counts
// customers carrying this tag, so a sub-account without it reports zero revenue
// from ads and looks like a campaign that never converted.
export const REQUIRED_TAGS = ["facebook ads"];

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

async function ensureTag(gctx: GhlContext, name: string): Promise<ProvisionItem> {
  try {
    const existing = await ghlJson<{ tags?: { id: string; name: string }[] }>(
      gctx,
      `/locations/${encodeURIComponent(gctx.locationId)}/tags`,
    );
    const has = (existing.tags ?? []).some(
      (t) => t.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (has) return { kind: "tag", name, outcome: "already correct" };

    await ghlJson(gctx, `/locations/${encodeURIComponent(gctx.locationId)}/tags`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { kind: "tag", name, outcome: "created" };
  } catch (err) {
    return { kind: "tag", name, outcome: `failed: ${(err as Error).message}` };
  }
}

// Run every provision step. Each step reports its own outcome rather than the
// whole run failing on the first error: a locked-down sub-account that refuses
// tag writes should still get its custom value.
export async function provisionLocation(
  gctx: GhlContext,
  webhookUrl: string,
): Promise<ProvisionItem[]> {
  const items: ProvisionItem[] = [];
  items.push(await upsertCustomValue(gctx, WEBHOOK_URL_VALUE_NAME, webhookUrl));
  for (const tag of REQUIRED_TAGS) {
    items.push(await ensureTag(gctx, tag));
  }
  return items;
}
