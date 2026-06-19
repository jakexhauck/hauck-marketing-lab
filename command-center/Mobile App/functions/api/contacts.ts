import type { Env, ApiData } from "../lib/env";
import { ghlJson } from "../lib/ghl";

interface GhlContact {
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
}

interface ContactsResponse {
  contacts: GhlContact[];
  meta?: { total?: number; nextPageUrl?: string };
}

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

function shapeContact(c: GhlContact): ApiContact {
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
  const all: GhlContact[] = [];
  const seen = new Set<string>();
  let url = `/contacts/?locationId=${encodeURIComponent(t.ghl_location_id)}&limit=100`;
  let pageCount = 0;
  const maxPages = 10;

  while (url && pageCount < maxPages) {
    const data = await ghlJson<ContactsResponse>(
      { token: t.ghl_token, locationId: t.ghl_location_id },
      url,
    );
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

  const contacts = all.map(shapeContact);
  contacts.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ contacts, total: contacts.length });
};
