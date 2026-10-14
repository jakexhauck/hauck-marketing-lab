import { ghlFetch, type GhlContext } from "./ghl";

// Mirror the owner's email/SMS notification choices into GHL so the snapshot's
// internal_notification actions obey them WITHOUT any workflow edits.
//
// How the snapshot actually works (confirmed against Made Better Landscaping
// Co's sub-account, the one the TEST_* env vars name):
// every internal staff alert is a GHL `internal_notification` action whose
// recipient is a LOCATION CUSTOM VALUE, not a hard-coded address:
//   to_custom_email  -> the staff email recipient
//   to_custom_number -> the staff SMS recipient
// GHL If/Else cannot branch on a custom value, so we can't gate the steps with a
// condition. Instead we toggle a channel by SETTING vs BLANKING its recipient
// custom value: an internal_notification with no recipient simply does not send.
//
//   email on  -> to_custom_email  = the owner's chosen address
//   email off -> to_custom_email  = "" (suppressed)
//   sms on    -> to_custom_number = the chosen number (smsNumber)
//   sms off   -> to_custom_number = "" (suppressed)
//
// Custom-value IDs differ per cloned account, so we match by fieldKey/name, not
// by one account's ids. Best-effort and idempotent: callers wrap this in
// waitUntil + catch; the Supabase tenant row is the source of truth.

const KEYS = {
  email: "to_custom_email",
  sms: "to_custom_number",
} as const;

interface CustomValue {
  id?: string;
  name?: string;
  fieldKey?: string;
  value?: string;
}

export interface NotifyPrefs {
  locationId: string;
  token: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailTo: string | null;
  // The SMS recipient number to set when SMS is on. Null leaves any existing
  // number in place when on, and is irrelevant when off (we blank it).
  smsNumber?: string | null;
}

// GHL exposes both a human name and a fieldKey (e.g.
// "{{ custom_values.to_custom_email }}"); a cloned snapshot may surface either.
function matches(cv: CustomValue, key: string): boolean {
  const name = (cv.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const fk = (cv.fieldKey ?? "").toLowerCase();
  return name === key || fk.endsWith(key) || fk.includes(`.${key}`);
}

export async function syncNotifyPrefsToGhl(prefs: NotifyPrefs): Promise<void> {
  if (!prefs.locationId || !prefs.token) return;
  const ctx: GhlContext = { locationId: prefs.locationId, token: prefs.token };
  const base = `/locations/${encodeURIComponent(prefs.locationId)}/customValues`;

  const listRes = await ghlFetch(ctx, base);
  if (!listRes.ok) {
    console.warn("[ghlNotifyPrefs] list customValues failed", listRes.status);
    return;
  }
  const list = (await listRes.json()) as { customValues?: CustomValue[] };
  const existing = list.customValues ?? [];

  // Build the desired recipient values. For SMS-on with no number supplied yet,
  // skip the write so we don't clobber a number set at promotion time.
  const writes: { key: string; value: string }[] = [
    { key: KEYS.email, value: prefs.emailEnabled ? (prefs.emailTo ?? "") : "" },
  ];
  if (!prefs.smsEnabled) {
    writes.push({ key: KEYS.sms, value: "" });
  } else if (prefs.smsNumber != null) {
    writes.push({ key: KEYS.sms, value: prefs.smsNumber });
  }

  for (const w of writes) {
    const found = existing.find((cv) => matches(cv, w.key));
    if (!found?.id) {
      console.warn("[ghlNotifyPrefs] custom value not found, skipping", w.key);
      continue;
    }
    try {
      await ghlFetch(ctx, `${base}/${encodeURIComponent(found.id)}`, {
        method: "PUT",
        body: JSON.stringify({ name: found.name ?? w.key, value: w.value }),
      });
    } catch (err) {
      console.warn(
        "[ghlNotifyPrefs] update failed",
        w.key,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
