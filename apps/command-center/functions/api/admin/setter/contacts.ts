import type { Env, ApiData } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { ghlJson } from "../../../lib/ghl";
import type { GhlContactRecord } from "../../../lib/ghl";

// GET /api/admin/setter/contacts?tenantId=&q= (admin-only, gated in
// _middleware.ts). Contact search for the Setter Suite booking panel: the
// setter has someone on the phone and needs the existing CRM record to book
// against. Read-only, and it never creates a contact.
//
// The inbox route's q filter was considered for this and rejected: it
// searches CONVERSATIONS, so a fresh lead who has never sent a message is
// invisible to it. That is exactly the contact a setter is most likely to be
// booking. GHL's /contacts/ endpoint takes a query param that matches name,
// phone and email server-side, so it finds them. Same path and response key
// as fetchAllContacts in ../../../lib/ghl, which this route deliberately does
// NOT reuse: that helper pages through up to 1000 records to build a full
// list, and a search box hit on every keystroke cannot afford it.
//
// Creds resolve through getGhlContextForTenant, which hard-fails on
// placeholder credentials rather than falling back to the env GHL vars (those
// are a real production client's).

const MIN_QUERY = 2;
const MAX_RESULTS = 20;

export interface ContactsQuery {
  tenantId: string;
  q: string;
}

export type ParsedContactsQuery =
  | { ok: true; query: ContactsQuery }
  | { ok: false; code: string };

// Pure: validate + normalize the query params. Unit-testable without a
// request.
export function parseContactsQuery(params: URLSearchParams): ParsedContactsQuery {
  const tenantId = params.get("tenantId");
  if (!tenantId || !tenantId.trim()) {
    return { ok: false, code: "missing_tenant_id" };
  }
  // A single character would match most of the location, so the floor is two
  // and a short query is treated as no query at all.
  const q = (params.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) {
    return { ok: false, code: "missing_query" };
  }
  return { ok: true, query: { tenantId: tenantId.trim(), q } };
}

export interface ShapedContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

// Pure: collapse a CRM contact record down to the four fields the picker
// shows. GHL fills contactName on some records and only firstName/lastName on
// others, so both are handled. A setter searching by phone needs to recognize
// the row they get back, so an unnamed contact shows its number rather than a
// bare placeholder.
export function shapeContact(raw: GhlContactRecord): ShapedContact {
  const phone = raw.phone ?? "";
  const joined = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
  const name = (raw.contactName ?? "").trim() || joined || phone || "Unknown contact";
  return { id: raw.id ?? "", name, phone, email: raw.email ?? "" };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const parsed = parseContactsQuery(url.searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });
  const { tenantId, q } = parsed.query;

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);

    const data = await ghlJson<{ contacts?: GhlContactRecord[] }>(
      gctx,
      `/contacts/?locationId=${encodeURIComponent(gctx.locationId)}` +
        `&query=${encodeURIComponent(q)}&limit=${MAX_RESULTS}`,
    );

    // The limit is asked for and enforced again here: an ignored or
    // over-served limit must not become an unbounded list in the picker.
    const contacts = (data.contacts ?? [])
      .map(shapeContact)
      .filter((c) => c.id)
      .slice(0, MAX_RESULTS);

    return Response.json({ contacts });
  } catch (e) {
    if (e instanceof TenantGhlError) {
      return Response.json({ error: e.code }, { status: e.status });
    }
    // ghlJson throws a plain Error carrying the status and body text, so the
    // CRM failure is surfaced as a 502 rather than a 500 the setter cannot
    // act on.
    const body = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "ghl_error", body }, { status: 502 });
  }
};
