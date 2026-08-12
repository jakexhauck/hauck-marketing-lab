import type { Env } from "../../lib/env";
import { liveTenantSlug } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { loadTenantBySlug, resolveGhlCreds } from "../../lib/tenantResolve";
import { readToken, tokenMatches } from "../../lib/webhookAuth";
import { customFieldDefs, fetchAllContacts, type GhlContext } from "../../lib/ghl";
import { loadAppointmentsByContact } from "../../lib/leadWhen";
import { buildSheetRows, type SheetContact } from "../../lib/sheetLeads";

// GET /api/sheets/leads?token=<SHEETS_SYNC_TOKEN>&tenant=<slug>
//
// The feed behind a client's Google Sheet lead tracker. Called by the Apps
// Script bound to that sheet, on a timer. Read-only, one client per call.
//
// Auth is a shared secret, not a session: an Apps Script has no cookie of ours
// and cannot get one. Same model, and the same constant-time compare, as
// /api/webhook. Fail closed: no env secret, no access. The secret buys exactly
// one thing, reading one tenant's leads, and can write nothing.
//
// Deliberately NOT scoped to the ads funnel. Jake chose every lead from any
// source (2026-08-12), so the sheet is the owner's whole book and the Source
// column is what tells a referral from a Facebook lead.
//
// See docs/build-plans/willis-lead-tracker-sheet.md.

// Contacts are paged 100 at a time. 20 pages is 2000 contacts, comfortably
// past any client's ad history, and the cap is reported rather than silently
// truncating the sheet.
const MAX_CONTACT_PAGES = 20;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { env, request } = ctx;

  const secret = env.SHEETS_SYNC_TOKEN ?? "";
  if (!secret) return json(503, { error: "sheets_sync_not_configured" });

  const supplied = readToken(request);
  if (!supplied || !(await tokenMatches(supplied, secret))) {
    return json(401, { error: "unauthorized" });
  }

  const url = new URL(request.url);
  const slug = (url.searchParams.get("tenant") || liveTenantSlug(env)).trim();

  const client = getServiceClient(env);
  if (!client) return json(503, { error: "database_not_configured" });

  const tenant = await loadTenantBySlug(client, slug);
  if (!tenant) return json(404, { error: "unknown_tenant", tenant: slug });

  const creds = resolveGhlCreds(tenant);
  if (!creds) return json(409, { error: "ghl_not_connected", tenant: slug });

  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };
  const now = Date.now();

  // Three calls' worth of work in parallel. Appointments are fetched once per
  // calendar for the whole roster (loadAppointmentsByContact), never once per
  // lead. A missing custom-field schema empties three columns; it is not a
  // reason to fail the whole sync, so it degrades instead of throwing.
  const [contacts, defs, appointments] = await Promise.all([
    fetchAllContacts(gctx, { maxPages: MAX_CONTACT_PAGES }),
    customFieldDefs(gctx).catch((err) => {
      console.warn("[sheets/leads] custom field defs failed", err);
      return [];
    }),
    loadAppointmentsByContact(gctx, now),
  ]);

  const rows = buildSheetRows(contacts as SheetContact[], defs, appointments, now);

  return json(200, {
    tenant: tenant.slug,
    generatedAt: new Date(now).toISOString(),
    count: rows.length,
    // True when the contact fetch hit its page cap, so the sheet can say so
    // rather than quietly missing the oldest leads.
    capped: contacts.length >= MAX_CONTACT_PAGES * 100,
    rows,
  });
};
