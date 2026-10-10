import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdAttribution } from "./adAttribution";
import type { TrackerLead } from "./adTrackerMetrics";
import type { GhlContactRecord } from "./ghl";
import { normalizeEmail, normalizePhone } from "./internalRecipients";
import { graphGet, graphGetAll } from "./metaGraph";
import { selectAllPages } from "./pagedSelect";

// Leads read straight off a client's Meta lead forms, for the Lead Tracker.
//
// The tracker's rows are GHL opportunities. When a client's GHL does not take
// a lead in (AAG, 2026-10-10: a form GHL was not mapped to, and zero
// opportunities in the account), the lead exists in Meta and nowhere the
// tracker looks. Jake: pull from Meta, leave GHL alone. So a tenant with
// tenants.meta_form_leads on gets every form lead added to its tracker, unless
// GHL already has that person on a row.
//
// Off by default. Willis clears opportunities on purpose (a GHL workflow), and
// reading Meta there would bring every cleared lead back.
//
// The forms are found through the client's ADS, not tenants.meta_page_id: AAG's
// stored page was wrong, and the ads always know which page they run on.

export interface MetaFormLead {
  id: string;
  formId: string;
  // ISO, UTC.
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  adId: string | null;
  adName: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  // Every form answer, by Meta's field name.
  answers: Record<string, string>;
}

// The Meta lead's id carries the row when GHL has no contact for them.
export const META_CONTACT_PREFIX = "meta:";

// How stale the stored copy may be before a tracker load asks Meta again.
const REFRESH_MS = 10 * 60 * 1000;

const LEAD_FIELDS =
  "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const orNull = (v: unknown): string | null => str(v) || null;

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function parseMetaLead(raw: Record<string, unknown>, formId = ""): MetaFormLead | null {
  const id = str(raw.id);
  const ms = Date.parse(str(raw.created_time));
  if (!id || !Number.isFinite(ms)) return null;

  const answers: Record<string, string> = {};
  for (const f of (raw.field_data as { name?: unknown; values?: unknown[] }[] | undefined) ?? []) {
    const key = str(f?.name);
    if (key) answers[key] = (f.values ?? []).map(str).filter(Boolean).join(", ");
  }
  const full = answers.full_name || [answers.first_name, answers.last_name].filter(Boolean).join(" ");

  return {
    id,
    formId: str(raw.form_id) || formId,
    createdAt: new Date(ms).toISOString(),
    name: titleCase(full),
    phone: answers.phone_number || answers.phone || "",
    email: normalizeEmail(answers.email ?? ""),
    adId: orNull(raw.ad_id),
    adName: orNull(raw.ad_name),
    adsetName: orNull(raw.adset_name),
    campaignId: orNull(raw.campaign_id),
    campaignName: orNull(raw.campaign_name),
    answers,
  };
}

// The Meta leads the tracker does not already have, as tracker leads plus the
// contact and attribution records the row builder reads names and ads from.
//
// A person GHL already has on a row is left to GHL. A person GHL holds only as
// a bare contact (Flossie: a phone, no name, no opportunity) gets a row under
// that contact's id. Anyone else gets meta:<lead id>. One row per person: the
// earliest form they filled in.
export function mergeMetaLeads(input: {
  leads: TrackerLead[];
  contacts: GhlContactRecord[];
  metaLeads: MetaFormLead[];
}): { leads: TrackerLead[]; contacts: GhlContactRecord[]; attribution: Map<string, AdAttribution | null> } {
  const onRow = new Set(input.leads.map((l) => l.contactId));
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const c of input.contacts) {
    const p = normalizePhone(c.phone);
    const e = normalizeEmail(c.email);
    if (p && !byPhone.has(p)) byPhone.set(p, c.id);
    if (e && !byEmail.has(e)) byEmail.set(e, c.id);
  }

  const leads: TrackerLead[] = [];
  const contacts: GhlContactRecord[] = [];
  const attribution = new Map<string, AdAttribution | null>();
  const seen = new Set<string>();

  const ordered = [...input.metaLeads].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const m of ordered) {
    const p = normalizePhone(m.phone);
    const e = normalizeEmail(m.email);
    const ghlId = (p && byPhone.get(p)) || (e && byEmail.get(e)) || "";
    if (ghlId && onRow.has(ghlId)) continue;

    const person = ghlId || (p ? `p:${p}` : e ? `e:${e}` : `m:${m.id}`);
    if (seen.has(person)) continue;
    seen.add(person);

    const contactId = ghlId || `${META_CONTACT_PREFIX}${m.id}`;
    leads.push({ contactId, createdAt: m.createdAt, level: "lead", status: "new", value: 0, adId: m.adId });
    contacts.push({ id: contactId, contactName: m.name, phone: m.phone, email: m.email });
    attribution.set(
      contactId,
      m.adId
        ? { adId: m.adId, campaignId: m.campaignId, campaignName: m.campaignName, adsetName: m.adsetName, adName: m.adName }
        : null,
    );
  }
  return { leads, contacts, attribution };
}

// ---------------------------------------------------------------------------

// Every lead on the forms this ad account's ads use, plus any other form on
// those pages that Meta says has leads (an ad can be switched to a new form,
// and the old one still holds the leads it took).
export async function fetchMetaFormLeads(token: string, adAccountId: string): Promise<MetaFormLead[]> {
  const ads = await graphGetAll(token, `/${adAccountId}/ads`, {
    fields: "creative{object_story_spec,asset_feed_spec}",
    limit: "200",
  });

  const adForms = new Set<string>();
  const pages = new Set<string>();
  for (const ad of ads) {
    const s = JSON.stringify(ad.creative ?? {});
    for (const m of s.matchAll(/"lead_gen_form_id":"(\d+)"/g)) adForms.add(m[1]);
    for (const m of s.matchAll(/"page_id":"(\d+)"/g)) pages.add(m[1]);
  }

  const out: MetaFormLead[] = [];
  for (const pageId of pages) {
    const page = await graphGet(token, `/${pageId}`, { fields: "access_token" });
    const pageToken = str(page.access_token);
    if (!pageToken) continue;

    const forms = await graphGetAll(pageToken, `/${pageId}/leadgen_forms`, {
      fields: "id,leads_count",
      limit: "100",
    });
    const wanted = forms
      .filter((f) => adForms.has(str(f.id)) || Number(f.leads_count ?? 0) > 0)
      .map((f) => str(f.id));

    const sets = await Promise.all(
      wanted.map((formId) =>
        graphGetAll(pageToken, `/${formId}/leads`, { fields: LEAD_FIELDS, limit: "500" }, 10, { strict: true }).then(
          (rows) => rows.map((r) => parseMetaLead(r, formId)),
        ),
      ),
    );
    for (const set of sets) for (const l of set) if (l) out.push(l);
  }
  return out;
}

function toRow(tenantId: string, l: MetaFormLead) {
  return {
    tenant_id: tenantId,
    leadgen_id: l.id,
    form_id: l.formId,
    created_time: l.createdAt,
    name: l.name,
    phone: l.phone,
    email: l.email,
    ad_id: l.adId,
    ad_name: l.adName,
    adset_name: l.adsetName,
    campaign_id: l.campaignId,
    campaign_name: l.campaignName,
    answers: l.answers,
  };
}

function fromRow(r: Record<string, unknown>): MetaFormLead {
  return {
    id: str(r.leadgen_id),
    formId: str(r.form_id),
    createdAt: new Date(str(r.created_time)).toISOString(),
    name: str(r.name),
    phone: str(r.phone),
    email: str(r.email),
    adId: orNull(r.ad_id),
    adName: orNull(r.ad_name),
    adsetName: orNull(r.adset_name),
    campaignId: orNull(r.campaign_id),
    campaignName: orNull(r.campaign_name),
    answers: (r.answers as Record<string, string>) ?? {},
  };
}

// The stored Meta leads for a tenant, asking Meta first when the copy is older
// than REFRESH_MS. A Meta failure keeps the last good copy rather than failing
// the tracker.
export async function loadMetaFormLeads(
  client: SupabaseClient,
  tenant: { id: string; metaAdAccountId: string | null; syncedAt: string | null },
  token: string | undefined,
): Promise<MetaFormLead[]> {
  const stale = !tenant.syncedAt || Date.now() - Date.parse(tenant.syncedAt) > REFRESH_MS;
  if (stale && token && tenant.metaAdAccountId) {
    try {
      const fresh = await fetchMetaFormLeads(token, tenant.metaAdAccountId);
      if (fresh.length > 0) {
        const { error } = await client
          .from("meta_form_leads")
          .upsert(fresh.map((l) => toRow(tenant.id, l)), { onConflict: "tenant_id,leadgen_id" });
        if (error) throw new Error(error.message);
      }
      await client.from("tenants").update({ meta_form_leads_synced_at: new Date().toISOString() }).eq("id", tenant.id);
    } catch (err) {
      console.warn("[meta-form-leads] refresh failed, using the stored copy", err);
    }
  }

  const rows = await selectAllPages<Record<string, unknown>>((from, to) =>
    client
      .from("meta_form_leads")
      .select("leadgen_id, form_id, created_time, name, phone, email, ad_id, ad_name, adset_name, campaign_id, campaign_name, answers")
      .eq("tenant_id", tenant.id)
      .order("leadgen_id", { ascending: true })
      .range(from, to),
  );
  return rows.map(fromRow);
}
