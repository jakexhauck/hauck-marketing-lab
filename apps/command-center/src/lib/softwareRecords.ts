import { api } from "./api";
import type { ApiContact, ApiConversation, ApiLead } from "./api";
import type { CustomersResponse } from "./customers";
import type { RecordKind } from "./softwareMap";

// Record pages (a single lead, a single contact, ...) can only be previewed
// against a real record, so the Software tab has to find one per client.
//
// It does that by calling the CLIENT's own list endpoints using the preview
// token it already holds, rather than adding a parallel set of admin endpoints
// that would duplicate the same queries. These are plain GETs, which is all a
// preview token is permitted to do.
//
// Each lookup is independent: one client having no customers must not stop the
// lead, contact and conversation rows from working, so failures resolve to null
// rather than rejecting.

export type RecordIds = Partial<Record<RecordKind, string | null>>;

function asPreview<T>(path: string, token: string): Promise<T> {
  return api<T>(path, { headers: { "x-preview-token": token } });
}

async function firstOrNull<T>(load: () => Promise<T | null>): Promise<T | null> {
  try {
    return await load();
  } catch {
    // A client with an unconfigured pipeline, no GHL creds, or simply no data.
    // The rail shows an honest "no record to preview" row for that kind.
    return null;
  }
}

export async function fetchRecordIds(token: string): Promise<RecordIds> {
  const [lead, contact, customer, conversation] = await Promise.all([
    firstOrNull(async () => {
      const r = await asPreview<{ leads: ApiLead[] }>("/api/leads", token);
      return r.leads?.[0]?.id ?? null;
    }),
    firstOrNull(async () => {
      const r = await asPreview<{ contacts: ApiContact[] }>("/api/contacts", token);
      return r.contacts?.[0]?.id ?? null;
    }),
    firstOrNull(async () => {
      const r = await asPreview<CustomersResponse>("/api/sales/customers", token);
      for (const col of r.columns ?? []) {
        const first = col.customers?.[0];
        if (first) return first.contactId;
      }
      return null;
    }),
    firstOrNull(async () => {
      const r = await asPreview<{ conversations: ApiConversation[] }>(
        "/api/conversations",
        token,
      );
      // The route is /conversations/:contactId, so the contact id is the key.
      return r.conversations?.[0]?.contactId ?? null;
    }),
  ]);

  return { lead, contact, customer, conversation };
}
