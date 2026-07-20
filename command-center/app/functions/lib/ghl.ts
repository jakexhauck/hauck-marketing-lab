import type { GhlAttribution } from "./adAttribution";

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export interface GhlContext {
  token: string;
  locationId: string;
}

export async function ghlFetch(
  ctx: GhlContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : BASE + path;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${ctx.token}`);
  headers.set("Version", VERSION);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  // Only idempotent methods are retried. GET/HEAD/PUT/DELETE can safely run
  // twice; retrying a POST on a 5xx/429 risks duplicate side effects (double
  // SMS, double note), so POSTs surface the error to the caller immediately.
  const method = (init.method ?? "GET").toUpperCase();
  const retryable =
    method === "GET" || method === "HEAD" || method === "PUT" || method === "DELETE";

  let res = await fetch(url, { ...init, headers });
  if (!retryable) return res;

  if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await fetch(url, { ...init, headers });
  } else if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000,
      2000,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { ...init, headers });
  }
  return res;
}

export async function ghlJson<T>(
  ctx: GhlContext,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await ghlFetch(ctx, path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GHL ${init.method ?? "GET"} ${path} returned ${res.status}: ${body.slice(0, 500)}`,
    );
  }
  return (await res.json()) as T;
}

// GHL's billing APIs (invoices, payments) do not accept locationId like the
// rest of the app. They take altId={locationId}&altType=location. Encode it once
// so no route hand-builds it.
export function altQuery(locationId: string): string {
  return `altId=${encodeURIComponent(locationId)}&altType=location`;
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number;
  status?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastStatusChangeAt?: string;
  contactId?: string;
  contact?: {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    // Present on some locations' opportunity search responses, absent on
    // others; the Setter Suite board reads it for the lead card when GHL
    // supplies it, and falls back to an empty string when it does not.
    city?: string;
  };
  source?: string;
  // GHL user id this opportunity is assigned to (drives rep-only filtering).
  assignedTo?: string;
}

export interface ApiLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  value: number | null;
  createdAt: string;
  lastActivityAt: string;
  // GHL user id the opportunity is assigned to, or null if unassigned.
  assignedUserId: string | null;
  // Detail-endpoint enrichment only; the list endpoint omits these (cost).
  attribution?: LeadAttribution | null;
  tags?: string[];
}

interface OpportunitySearchResponse {
  opportunities: GhlOpportunity[];
  meta?: {
    total?: number;
    startAfterId?: string;
    startAfter?: string;
    nextPageUrl?: string;
  };
}

// Paginated fetch of every opportunity for a location (optionally one
// pipeline), capped at maxPages * 100. GHL's opportunities-search may return
// either a full nextPageUrl (like contacts) or startAfterId / startAfter
// cursor fields; both styles are handled. Used by the leads list and summary
// so counts cover all opportunities, not page 1.
export async function fetchAllOpportunities(
  ctx: GhlContext,
  opts: {
    pipelineId?: string | null;
    maxPages?: number;
    // Output parameter: when supplied, its `.value` is set to true if
    // pagination stopped because the maxPages cap was hit rather than
    // because a real last page was reached. Optional and additive so every
    // existing caller (21 across the app) is unaffected; only a caller that
    // needs to tell an honest "there may be more" apart from "this is
    // everything" passes it. See the Setter Suite leads endpoint.
    truncated?: { value: boolean };
  } = {},
): Promise<GhlOpportunity[]> {
  const maxPages = opts.maxPages ?? 10;
  const base = `/opportunities/search?location_id=${encodeURIComponent(ctx.locationId)}&limit=100${
    opts.pipelineId ? `&pipeline_id=${encodeURIComponent(opts.pipelineId)}` : ""
  }`;

  const all: GhlOpportunity[] = [];
  const seen = new Set<string>();
  let nextPageUrl: string | undefined;
  let startAfterId: string | undefined;
  let startAfter: string | undefined;
  let pageCount = 0;

  while (pageCount < maxPages) {
    let path: string;
    if (nextPageUrl) {
      path = nextPageUrl;
    } else {
      path = base;
      if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
      if (startAfter) path += `&startAfter=${encodeURIComponent(startAfter)}`;
    }

    const data = await ghlJson<OpportunitySearchResponse>(ctx, path);

    const page = data.opportunities ?? [];
    for (const o of page) {
      if (o.id && !seen.has(o.id)) {
        seen.add(o.id);
        all.push(o);
      }
    }

    // Stop on the natural last page (short page) regardless of cursor style.
    if (page.length < 100) break;

    const next = data.meta?.nextPageUrl;
    const nextId = data.meta?.startAfterId;
    const nextTs = data.meta?.startAfter;

    if (next) {
      if (next === nextPageUrl) break;
      nextPageUrl = next;
    } else {
      if (!nextId || nextId === startAfterId) break;
      startAfterId = nextId;
      startAfter = nextTs;
    }

    pageCount += 1;
  }

  if (pageCount >= maxPages) {
    console.warn(
      `opportunity pagination hit maxPages cap for location ${ctx.locationId}`,
    );
    if (opts.truncated) opts.truncated.value = true;
  }

  return all;
}

export interface GhlConversation {
  id: string;
  contactId?: string;
  fullName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  lastMessageBody?: string;
  // Documented as a string enum, but GHL's types lie elsewhere in this
  // response (see lastMessageDate), so treat it as untrusted too.
  lastMessageType?: string | number;
  // Epoch millis in raw search responses, but tolerate ISO strings.
  lastMessageDate?: string | number;
  unreadCount?: number;
  type?: string;
}

interface ConversationSearchResponse {
  conversations?: GhlConversation[];
  total?: number;
}

// Paginated fetch of every conversation for a location, capped at maxPages*100.
// The search endpoint returns no cursor; it pages by startAfterDate derived from
// the last row's lastMessageDate (epoch ms, matching sortBy=last_message_date).
// Used by the inbox list AND the dashboard unread count, so both cover every
// conversation, not just page 1.
export async function fetchAllConversations(
  ctx: GhlContext,
  opts: { maxPages?: number } = {},
): Promise<GhlConversation[]> {
  const maxPages = opts.maxPages ?? 10;
  const base = `/conversations/search?locationId=${encodeURIComponent(ctx.locationId)}&limit=100&sort=desc&sortBy=last_message_date`;

  const all: GhlConversation[] = [];
  const seen = new Set<string>();
  let startAfterDate: number | undefined;
  let pageCount = 0;

  const sortKeyMs = (c: GhlConversation): number | undefined => {
    if (typeof c.lastMessageDate === "number") return c.lastMessageDate;
    if (c.lastMessageDate) {
      const ms = +new Date(c.lastMessageDate);
      if (Number.isFinite(ms)) return ms;
    }
    return undefined;
  };

  while (pageCount < maxPages) {
    const path =
      startAfterDate === undefined
        ? base
        : `${base}&startAfterDate=${encodeURIComponent(String(startAfterDate))}`;

    const data = await ghlJson<ConversationSearchResponse>(ctx, path);
    const page = data.conversations ?? [];
    for (const c of page) {
      if (c.id && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }

    // Stop on the natural last page (short page).
    if (page.length < 100) break;

    const next = sortKeyMs(page[page.length - 1]);
    if (next === undefined || next === startAfterDate) break;
    startAfterDate = next;

    pageCount += 1;
  }

  if (pageCount >= maxPages) {
    console.warn(
      `conversation pagination hit maxPages cap for location ${ctx.locationId}`,
    );
  }

  return all;
}

export interface GhlContactRecord {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateAdded?: string;
  dateUpdated?: string;
  tags?: string[];
  source?: string;
  // Touch history, including Meta ad ids on paid-social leads. Already on the
  // wire from the bulk list; see adAttribution.ts for why this and not the
  // utm_* custom fields.
  attributions?: GhlAttribution[];
}

interface ContactsPage {
  contacts?: GhlContactRecord[];
  meta?: { total?: number; nextPageUrl?: string };
}

// Paginated fetch of every contact for a location (id, source, tags, dates).
// Shared by the Contacts surface and the Unified Inbox source join.
export async function fetchAllContacts(
  ctx: GhlContext,
  opts: { maxPages?: number } = {},
): Promise<GhlContactRecord[]> {
  const maxPages = opts.maxPages ?? 10;
  const all: GhlContactRecord[] = [];
  const seen = new Set<string>();
  let url = `/contacts/?locationId=${encodeURIComponent(ctx.locationId)}&limit=100`;
  let pageCount = 0;
  while (url && pageCount < maxPages) {
    const data = await ghlJson<ContactsPage>(ctx, url);
    const page = data.contacts ?? [];
    for (const c of page) {
      if (c.id && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }
    const next = data.meta?.nextPageUrl;
    if (!next || page.length === 0) break;
    url = next;
    pageCount += 1;
  }
  return all;
}

// Resolve the location's custom-field ids to their fieldKeys (e.g.
// "contact.utm_source"), cached in-memory for an hour. Contact records only
// carry {id, value} pairs; this map is what makes them readable.
interface CustomFieldDef {
  id: string;
  fieldKey?: string;
  name?: string;
}
interface CustomFieldsCacheEntry {
  data: Map<string, string>;
  expiresAt: number;
}
const customFieldsCache = new Map<string, CustomFieldsCacheEntry>();
const CUSTOM_FIELDS_TTL_MS = 60 * 60_000;

export async function customFieldKeyMap(
  ctx: GhlContext,
): Promise<Map<string, string>> {
  const key = `customFields:${ctx.locationId}`;
  const hit = customFieldsCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const data = await ghlJson<{ customFields?: CustomFieldDef[] }>(
    ctx,
    `/locations/${encodeURIComponent(ctx.locationId)}/customFields`,
  );
  const map = new Map<string, string>();
  for (const f of data.customFields ?? []) {
    if (f.id && f.fieldKey) map.set(f.id, f.fieldKey);
  }
  customFieldsCache.set(key, {
    data: map,
    expiresAt: Date.now() + CUSTOM_FIELDS_TTL_MS,
  });
  return map;
}

export interface LeadAttribution {
  source: string;
  campaign: string;
  ad: string;
  adset: string;
}

// Map a contact's custom-field values onto the attribution block using the
// location's field-key map. Field keys arrive as "contact.utm_source".
//
// WARNING: these fields are empty in practice. Measured 2026-07-19 across 100
// live Willis contacts: utm_source / utm_campaign / utm_ad / utm_adset all 0
// populated, as are utm_ad_id / utm_adset_id / utm_campaign_id. The fields
// exist in the location schema and nothing writes to them, so this returns
// null on real data. Kept because the lead detail route still calls it and it
// is harmless. For attribution that actually works, use
// firstTouchAttribution() in adAttribution.ts, which reads contact
// .attributions[] off the bulk list.
export function attributionFromCustomFields(
  customFields: { id?: string; value?: unknown }[] | undefined,
  keyMap: Map<string, string>,
): LeadAttribution | null {
  if (!customFields?.length) return null;
  const byKey = new Map<string, string>();
  for (const f of customFields) {
    if (!f.id) continue;
    const fieldKey = keyMap.get(f.id);
    if (!fieldKey) continue;
    const bare = fieldKey.replace(/^contact\./, "");
    if (typeof f.value === "string" && f.value.trim()) {
      byKey.set(bare, f.value.trim());
    }
  }
  const attribution: LeadAttribution = {
    source: byKey.get("utm_source") ?? "",
    campaign: byKey.get("utm_campaign") ?? "",
    ad: byKey.get("utm_ad") ?? "",
    adset: byKey.get("utm_adset") ?? "",
  };
  return Object.values(attribution).some(Boolean) ? attribution : null;
}

// Create a contact in GHL (v2 contacts API) and return its id. The location id
// is required by GHL on create; name/email/phone are all optional on their end,
// but the caller guarantees at least a name. Errors surface via ghlJson.
export async function createContact(
  ctx: GhlContext,
  input: { name: string; email?: string; phone?: string },
): Promise<string> {
  const body: Record<string, unknown> = { locationId: ctx.locationId };
  if (input.name) body.name = input.name;
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = input.phone;

  const data = await ghlJson<{ contact?: { id?: string } }>(ctx, "/contacts/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = data.contact?.id;
  if (!id) throw new Error("GHL POST /contacts/ returned no contact id");
  return id;
}

// Create an opportunity in GHL (v2 opportunities API) for an existing contact
// and return it shaped as an ApiLead. status defaults to "open" (the only state
// a freshly created lead can be in).
export async function createOpportunity(
  ctx: GhlContext,
  input: {
    contactId: string;
    pipelineId: string;
    pipelineStageId: string;
    name: string;
    monetaryValue?: number | null;
  },
): Promise<ApiLead> {
  const body: Record<string, unknown> = {
    locationId: ctx.locationId,
    contactId: input.contactId,
    pipelineId: input.pipelineId,
    pipelineStageId: input.pipelineStageId,
    name: input.name,
    status: "open",
  };
  if (typeof input.monetaryValue === "number") {
    body.monetaryValue = input.monetaryValue;
  }

  const data = await ghlJson<{ opportunity: GhlOpportunity }>(
    ctx,
    "/opportunities/",
    { method: "POST", body: JSON.stringify(body) },
  );
  return shapeOpportunity(data.opportunity);
}

export function shapeOpportunity(o: GhlOpportunity): ApiLead {
  const fullName =
    o.contact?.name ||
    [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim();
  return {
    id: o.id,
    name: o.name || fullName || "Unknown",
    phone: o.contact?.phone ?? "",
    email: o.contact?.email ?? "",
    contactId: o.contact?.id ?? o.contactId ?? "",
    pipelineId: o.pipelineId ?? "",
    pipelineStageId: o.pipelineStageId ?? "",
    status: o.status ?? "open",
    value: typeof o.monetaryValue === "number" ? o.monetaryValue : null,
    createdAt: o.createdAt ?? new Date().toISOString(),
    lastActivityAt:
      o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? new Date().toISOString(),
    assignedUserId: o.assignedTo ?? null,
  };
}
