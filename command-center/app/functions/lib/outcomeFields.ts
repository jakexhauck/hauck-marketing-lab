import { ghlJson, type GhlContext } from "./ghl";
import { FORM_FIELDS, type FormAnswers } from "./outcome";

// The booking form's questions on the outcome page are contact custom fields
// (Street Address, Services, Any Notes For The Appointment), found BY NAME per
// sub-account so the snapshot's own fields are the ones filled. Needs
// locations/customFields.readonly (granted 2026-10-10).

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const cache = new Map<string, { ids: Map<string, string>; expiresAt: number }>();

// Form key -> custom field id, for the fields this sub-account has.
export async function formFieldIds(gctx: GhlContext): Promise<Map<string, string>> {
  const hit = cache.get(gctx.locationId);
  if (hit && hit.expiresAt > Date.now()) return hit.ids;
  const { customFields = [] } = await ghlJson<{ customFields?: { id: string; name: string; model?: string }[] }>(
    gctx,
    `/locations/${encodeURIComponent(gctx.locationId)}/customFields?model=contact`,
  );
  const byName = new Map(customFields.map((f) => [norm(f.name), f.id]));
  const ids = new Map<string, string>();
  for (const f of FORM_FIELDS) {
    const id = byName.get(norm(f.name));
    if (id) ids.set(f.key, id);
  }
  cache.set(gctx.locationId, { ids, expiresAt: Date.now() + 10 * 60_000 });
  return ids;
}

// What the contact already has in those fields, to prefill the page.
export function answersFromContact(
  contact: { customFields?: { id: string; value?: unknown }[] } | null,
  ids: Map<string, string>,
): FormAnswers {
  const values = new Map((contact?.customFields ?? []).map((c) => [c.id, c.value]));
  const out = {} as FormAnswers;
  for (const f of FORM_FIELDS) {
    const v = values.get(ids.get(f.key) ?? "");
    out[f.key] = typeof v === "string" ? v : "";
  }
  return out;
}

// Write the answers back. Only fields the sub-account has; blanks are written
// too, so clearing a box on the page clears it in GHL.
export async function saveAnswers(
  gctx: GhlContext,
  contactId: string,
  form: FormAnswers,
  ids: Map<string, string>,
): Promise<void> {
  const customFields = FORM_FIELDS.filter((f) => ids.has(f.key)).map((f) => ({
    id: ids.get(f.key) as string,
    value: form[f.key],
  }));
  if (customFields.length === 0) return;
  await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: JSON.stringify({ customFields }),
  });
}
