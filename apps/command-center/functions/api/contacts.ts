import type { Env, ApiData } from "../lib/env";
import { fetchAllContacts, type GhlContactRecord } from "../lib/ghl";

export interface ApiContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
}

function shapeContact(c: GhlContactRecord): ApiContact {
  const fullName =
    c.contactName ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.email ||
    "Unknown";
  const created = c.dateAdded ?? new Date().toISOString();
  return {
    id: c.id,
    name: fullName,
    phone: c.phone ?? "",
    email: c.email ?? "",
    source: c.source ?? "",
    tags: c.tags ?? [],
    createdAt: created,
    lastActivityAt: c.dateUpdated ?? created,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const all = await fetchAllContacts({
    token: t.ghl_token,
    locationId: t.ghl_location_id,
  });
  const contacts = all.map(shapeContact);
  contacts.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );
  return Response.json({ contacts, total: contacts.length });
};
