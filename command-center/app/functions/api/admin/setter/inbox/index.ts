import type { Env, ApiData } from "../../../../lib/env";
import {
  fetchAllConversations,
  fetchAllContacts,
  type GhlConversation,
} from "../../../../lib/ghl";
import { makeInternalConversationFilter } from "../../../../lib/internalRecipients";
import { normalizeMessageType } from "../../../../lib/messaging";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";

// GET /api/admin/setter/inbox?tenantId=&q=&limit=&cursor= (admin-only, gated
// in _middleware.ts). The client's WHOLE inbox, paged.
//
// Deliberately not shaped like the client app's /api/conversations, which
// fetches every conversation for the location, joins contacts + opportunities
// + pipelines, and returns the lot in one response. That is affordable for a
// tenant looking at their own inbox once; it is not affordable here, where a
// setter scrolls a client with thousands of threads. So this endpoint pages,
// and it only fetches as many upstream pages as the requested window actually
// needs (see pagesNeeded).
//
// Credentials come from getGhlContextForTenant ONLY. resolveGhlCreds in
// tenantResolve.ts falls back to env.GHL_LOCATION_ID / env.GHL_TOKEN, which
// are a live production client's credentials: on this cross-client screen
// that fallback would show a setter another client's real customer
// conversations, and the send endpoint next door would reply to them.

export interface ApiInboxThread {
  contactId: string;
  name: string;
  preview: string;
  lastMessageAt: string;
  lastMessageType: string;
  unreadCount: number;
}

export const DEFAULT_LIMIT = 50;
// The client pages by GROWING this window from the top (50, then 100, then
// 150), not by walking an offset. An offset into a list that re-sorts by
// recency on every request silently SKIPS rows: a thread that receives a new
// inbound message jumps to index 0, everything shifts down, and the row that
// crossed the page boundary is never returned. The skipped row is by
// construction the one with fresh activity, which is the single most important
// row on a setter's screen. Re-reading from the top cannot skip.
export const MAX_LIMIT = 500;

// fetchAllConversations pulls 100 conversations per upstream page.
const UPSTREAM_PAGE_SIZE = 100;
// Hard ceiling on upstream pages for one request: 1000 conversations. Beyond
// this the setter is expected to search rather than scroll.
const MAX_UPSTREAM_PAGES = 10;
// A search has to look past the current window (a match may sit far down the
// list), so it scans a wider but still bounded slice.
const SEARCH_UPSTREAM_PAGES = 10;

export function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// The cursor is an opaque-to-the-caller offset into the filtered list. GHL's
// conversation search has no cursor of its own that survives filtering, so
// there is nothing more durable to hand back.
export function parseCursor(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function nameOf(c: GhlConversation): string {
  return c.fullName || c.contactName || c.email || c.phone || "Unknown";
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

// Server-side search so the setter is not searching only the page they happen
// to be holding. Name is a plain substring match; a query with digits in it
// also matches the phone with all formatting stripped from both sides, so
// "(555) 123" finds "+15551234567".
export function matchesQuery(c: GhlConversation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (nameOf(c).toLowerCase().includes(needle)) return true;
  const qDigits = digitsOnly(needle);
  if (qDigits && c.phone && digitsOnly(c.phone).includes(qDigits)) return true;
  return false;
}

function isSystemActivity(t: string): boolean {
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

function lastMessageMs(c: GhlConversation): number {
  if (typeof c.lastMessageDate === "number") return c.lastMessageDate;
  if (c.lastMessageDate) {
    const ms = +new Date(c.lastMessageDate);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export function shapeThread(c: GhlConversation): ApiInboxThread {
  const rawType = typeof c.lastMessageType === "string" ? c.lastMessageType : "";
  const type = normalizeMessageType({ type: c.lastMessageType });
  const ms = lastMessageMs(c);
  return {
    contactId: c.contactId as string,
    name: nameOf(c),
    // A stage-move activity has a body that reads like a message but is not
    // one; showing it as the preview makes the CRM look like it talked to the
    // customer.
    preview: isSystemActivity(rawType) ? "" : (c.lastMessageBody ?? ""),
    lastMessageAt: new Date(ms || Date.now()).toISOString(),
    lastMessageType: type,
    unreadCount: c.unreadCount ?? 0,
  };
}

// How many upstream pages this request actually needs. Without this the route
// would inherit fetchAllConversations' default of ten pages for every request,
// so a setter opening the inbox would pull a thousand conversations to render
// fifty.
export function pagesNeeded(offset: number, limit: number, searching: boolean): number {
  if (searching) return SEARCH_UPSTREAM_PAGES;
  // +1 so we can tell whether a next page exists without a second request.
  const needed = Math.ceil((offset + limit + 1) / UPSTREAM_PAGE_SIZE);
  return Math.min(Math.max(needed, 1), MAX_UPSTREAM_PAGES);
}

// Did the upstream fetch hit its page cap? A full haul means GHL had at least
// as many conversations as we were willing to pull, so there are probably more
// we never looked at.
export function isUpstreamCapped(convCount: number, pagesRequested: number): boolean {
  return convCount >= pagesRequested * UPSTREAM_PAGE_SIZE;
}

export function pageThreads(
  convs: GhlConversation[],
  opts: { q: string; limit: number; offset: number; upstreamCapped?: boolean },
): { threads: ApiInboxThread[]; nextCursor: string | null; truncated: boolean } {
  // Filter BEFORE slicing: filtering a page that was already cut would hide
  // matches that sort below the window.
  const filtered = convs
    .filter((c) => Boolean(c.contactId))
    .filter((c) => matchesQuery(c, opts.q))
    .sort((a, b) => lastMessageMs(b) - lastMessageMs(a));

  const end = opts.offset + opts.limit;
  const threads = filtered.slice(opts.offset, end).map(shapeThread);
  return {
    threads,
    nextCursor: filtered.length > end ? String(end) : null,
    // The caller MUST distinguish "that is the whole inbox" from "that is as
    // far as we looked". Without this the cap renders as a definitive end of
    // list, and a search that found nothing past conversation 1000 renders as
    // a confident "no matches" when the answer is really "not in the part we
    // searched". Same principle as loading / failed / empty being distinct:
    // complete and truncated are different answers and must not be conflated.
    truncated: Boolean(opts.upstreamCapped),
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseCursor(url.searchParams.get("cursor"));

  let gctx;
  try {
    gctx = await getGhlContextForTenant(ctx.env, tenantId);
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }

  try {
    const pages = pagesNeeded(offset, limit, Boolean(q));
    // The contact roster comes along only to identify internal notification
    // sinks. Jake's call 2026-07-21: they are hidden everywhere, including the
    // agency's own setter tools, not just the client app. Degrades to an empty
    // roster on failure, leaving the configured-recipient signal working.
    const [convs, contacts] = await Promise.all([
      fetchAllConversations(gctx, { maxPages: pages }),
      fetchAllContacts(gctx).catch(() => []),
    ]);
    const isInternalConversation = makeInternalConversationFilter(
      contacts,
      gctx.internal_recipients,
    );
    const visible = convs.filter((c) => !isInternalConversation(c));
    return Response.json(
      pageThreads(visible, {
        q,
        limit,
        offset,
        upstreamCapped: isUpstreamCapped(convs.length, pages),
      }),
    );
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
};
