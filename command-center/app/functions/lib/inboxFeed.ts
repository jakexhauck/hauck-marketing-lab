import {
  fetchAllConversations,
  fetchAllContacts,
  fetchAllOpportunities,
  ghlJson,
  type GhlContext,
  type GhlConversation,
  type GhlOpportunity,
} from "./ghl";
import { readContactDnd, type ContactDnd } from "./dnd";
import { makeInternalConversationFilter } from "./internalRecipients";
import { normalizeMessageType, type ThreadMessage } from "./messaging";

// One page of a GoHighLevel inbox, for any account.
//
// This is the Setter Suite inbox's core, lifted out of its route so a second
// inbox can read the same way rather than by copy. The Operations pillar's
// Inbox reads Hauck Marketing's OWN sub-account through it; the Setter Suite
// reads whichever client its picker holds.
//
// What is deliberately NOT here is credential resolution. The two inboxes point
// at different accounts, and which account a request reaches is the one thing
// that must never be decided by shared code with a default: a helper that could
// fall back to another location would text a real customer under the wrong
// name. Each route resolves its own context and passes it in.
//
// Deliberately not shaped like the client app's /api/conversations, which
// fetches every conversation for the location, joins contacts + opportunities
// + pipelines, and returns the lot in one response. That is affordable for a
// tenant looking at their own inbox once; it is not affordable here, where a
// setter scrolls a client with thousands of threads. So this pages, and it only
// fetches as many upstream pages as the requested window actually needs (see
// pagesNeeded).

export interface ApiInboxThread {
  contactId: string;
  name: string;
  preview: string;
  lastMessageAt: string;
  lastMessageType: string;
  unreadCount: number;
  // Where this person sits in the CRM, or null when they hold no opportunity
  // at all. The inbox groups on this: a setter opening a thread needs to know
  // whether they are talking to a lead being worked, a booked appointment or
  // somebody who is not in a pipeline at all, WITHOUT leaving the inbox.
  //
  // null is only ever "no opportunity found". When the placement lookup itself
  // fails or is incomplete the response says so at the top level
  // (placementAvailable / placementComplete) rather than quietly labelling the
  // whole inbox as un-pipelined, which would be a confident lie about every
  // row on the screen.
  pipelineId: string | null;
  pipelineName: string | null;
  stageName: string | null;
  // Which channels this contact has switched off, or null when the contact's
  // record was not in the roster we read.
  //
  // null means "we did not see it", NOT "they are contactable". Nothing in the
  // UI is allowed to render null as an all-clear: the only claim this app ever
  // makes about DND is a block it actually observed. That asymmetry is the
  // whole point, because the failure it prevents is a setter typing a text
  // into a number the carrier will reject.
  dnd: ContactDnd | null;
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
// Opportunity pages pulled to work out where each contact sits (100 each, so
// 1000 opportunities). Same ceiling as the conversation read: past this the
// response says the placement is incomplete rather than guessing.
const MAX_OPPORTUNITY_PAGES = 10;

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

export function shapeThread(
  c: GhlConversation,
  placement?: Map<string, ThreadPlacement>,
  dnd?: Map<string, ContactDnd>,
): ApiInboxThread {
  const rawType = typeof c.lastMessageType === "string" ? c.lastMessageType : "";
  const type = normalizeMessageType({ type: c.lastMessageType });
  const ms = lastMessageMs(c);
  const where = placement?.get(c.contactId as string) ?? null;
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
    pipelineId: where?.pipelineId ?? null,
    pipelineName: where?.pipelineName ?? null,
    stageName: where?.stageName ?? null,
    dnd: dnd?.get(c.contactId as string) ?? null,
  };
}

// contactId -> DND, for every contact whose record the roster actually held.
// Contacts with nothing switched off are deliberately INCLUDED (as an
// all-clear object) rather than omitted, so a later reader can tell "we looked
// and they are fine" apart from "we never saw them".
export function buildDndIndex(
  contacts: Array<{ id?: string; dnd?: boolean; dndSettings?: Record<string, { status?: string; message?: string } | null | undefined> }>,
): Map<string, ContactDnd> {
  const index = new Map<string, ContactDnd>();
  for (const c of contacts) {
    if (!c.id) continue;
    const dnd = readContactDnd(c);
    if (dnd) index.set(c.id, dnd);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Pipeline placement
// ---------------------------------------------------------------------------

export interface ThreadPlacement {
  pipelineId: string;
  pipelineName: string;
  stageName: string;
}

interface PlacementStage {
  id: string;
  name: string;
}
interface PlacementPipeline {
  id: string;
  name: string;
  stages?: PlacementStage[];
}
interface PlacementPipelinesResponse {
  pipelines?: PlacementPipeline[];
}

// A contact can hold several opportunities at once (a lead that also became a
// review request, a repeat customer). The inbox shows ONE line per person, so
// one of them has to win, and the rule is stated here rather than left to
// whatever order GHL happened to return:
//
//   1. An OPEN opportunity beats a closed one (won/lost/abandoned). Where a
//      person is being worked right now matters more than where they finished.
//   2. Within that, the most recently touched wins, using the same timestamp
//      the board sorts by (lastStatusChangeAt, else updatedAt, else createdAt).
//
// Opportunities in a pipeline this location no longer returns are skipped: a
// stage name we cannot resolve would render as an empty chip, which reads as
// "no stage" rather than "unknown pipeline".
export function buildPlacementIndex(
  opps: GhlOpportunity[],
  pipelines: PlacementPipeline[],
): Map<string, ThreadPlacement> {
  const byPipeline = new Map<string, PlacementPipeline>();
  for (const p of pipelines) byPipeline.set(p.id, p);

  const best = new Map<string, { placement: ThreadPlacement; open: boolean; at: number }>();

  for (const o of opps) {
    const contactId = o.contact?.id ?? o.contactId;
    if (!contactId || !o.pipelineId) continue;
    const pipeline = byPipeline.get(o.pipelineId);
    if (!pipeline) continue;

    const stage = (pipeline.stages ?? []).find((s) => s.id === o.pipelineStageId);
    const open = (o.status ?? "open").toLowerCase() === "open";
    const at = +new Date(o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? 0) || 0;

    const current = best.get(contactId);
    if (current) {
      if (current.open !== open) {
        if (!open) continue;
      } else if (at <= current.at) {
        continue;
      }
    }

    best.set(contactId, {
      open,
      at,
      placement: {
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        stageName: stage?.name ?? "",
      },
    });
  }

  const index = new Map<string, ThreadPlacement>();
  for (const [contactId, entry] of best) index.set(contactId, entry.placement);
  return index;
}

// Reads every opportunity in the location once (the same haul the board pays
// for per pipeline) and resolves it against the live pipeline list, so a
// renamed stage follows on the next load with no mapping table here.
//
// `complete` is false when the opportunity read hit its page cap. That matters:
// an incomplete read makes real leads look like they are in no pipeline, and
// the UI has to be able to say "we did not see all of them" instead of showing
// a confident "Not in a pipeline" heading over people who are.
export async function loadPlacement(
  gctx: GhlContext,
): Promise<{ index: Map<string, ThreadPlacement>; complete: boolean }> {
  const truncated = { value: false };
  const [pipeData, opps] = await Promise.all([
    ghlJson<PlacementPipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
    ),
    fetchAllOpportunities(gctx, { maxPages: MAX_OPPORTUNITY_PAGES, truncated }),
  ]);
  return {
    index: buildPlacementIndex(opps, pipeData.pipelines ?? []),
    complete: !truncated.value,
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
  opts: {
    q: string;
    limit: number;
    offset: number;
    upstreamCapped?: boolean;
    placement?: Map<string, ThreadPlacement>;
    dnd?: Map<string, ContactDnd>;
  },
): { threads: ApiInboxThread[]; nextCursor: string | null; truncated: boolean } {
  // Filter BEFORE slicing: filtering a page that was already cut would hide
  // matches that sort below the window.
  const filtered = convs
    .filter((c) => Boolean(c.contactId))
    .filter((c) => matchesQuery(c, opts.q))
    .sort((a, b) => lastMessageMs(b) - lastMessageMs(a));

  const end = opts.offset + opts.limit;
  const threads = filtered
    .slice(opts.offset, end)
    .map((c) => shapeThread(c, opts.placement, opts.dnd));
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

export interface InboxPageResponse {
  threads: ApiInboxThread[];
  nextCursor: string | null;
  truncated: boolean;
  placementAvailable: boolean;
  placementComplete: boolean;
}

// One page of an inbox, fetched and shaped. The caller has already resolved
// which account `gctx` points at, and passes the internal-recipient list (a
// per-tenant setting) when the account has one.
export async function loadInboxPage(
  gctx: GhlContext,
  opts: { q: string; limit: number; offset: number; internalRecipients?: string },
): Promise<InboxPageResponse> {
  const pages = pagesNeeded(opts.offset, opts.limit, Boolean(opts.q));
  // The contact roster comes along only to identify internal notification
  // sinks. Jake's call 2026-07-21: they are hidden everywhere, including the
  // agency's own setter tools, not just the client app. Degrades to an empty
  // roster on failure, leaving the configured-recipient signal working.
  const [convs, contacts, placement] = await Promise.all([
    fetchAllConversations(gctx, { maxPages: pages }),
    fetchAllContacts(gctx).catch(() => []),
    // Degrades to null rather than failing the inbox: a setter who cannot
    // see the pipeline grouping can still read and answer their messages,
    // which is what this screen is for. The flags below tell the UI to drop
    // back to one flat list instead of inventing a "Not in a pipeline"
    // heading over the entire inbox.
    loadPlacement(gctx).catch(() => null),
  ]);
  const isInternalConversation = makeInternalConversationFilter(
    contacts,
    opts.internalRecipients,
  );
  const visible = convs.filter((c) => !isInternalConversation(c));
  // The same roster the internal-recipient filter already needed, read a
  // second way. No extra request: DND rides along on the bulk contact list.
  const dnd = buildDndIndex(contacts);
  return {
    ...pageThreads(visible, {
      q: opts.q,
      limit: opts.limit,
      offset: opts.offset,
      upstreamCapped: isUpstreamCapped(convs.length, pages),
      placement: placement?.index,
      dnd,
    }),
    placementAvailable: placement !== null,
    placementComplete: placement?.complete ?? false,
  };
}

// ---------------------------------------------------------------------------
// One thread
// ---------------------------------------------------------------------------

export interface ApiThreadMessage {
  id: string;
  direction: string;
  channel: string;
  body: string;
  sentAt: string;
}

// Pure: rename the lib's thread shape onto the API contract.
export function shapeMessages(messages: ThreadMessage[]): ApiThreadMessage[] {
  return messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    channel: m.type,
    body: m.body,
    sentAt: m.at,
  }));
}

// sendChannelMessage's codes predate this contract (it backs the client app's
// own send routes too). Map its vocabulary onto the documented one rather
// than renaming it there, which would change two live client-facing routes.
export const SEND_ERROR_CODES: Record<string, string> = {
  empty_message: "missing_body",
  subject_required: "missing_subject",
};
