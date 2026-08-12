// Which GHL conversations belong to the CLIENT, and which are ours.
//
// The client's Inbox used to show every conversation in their sub-account. That
// meant the setter's own work — the raw opt-ins, the seven-day no-answer chase,
// the binned leads — sat in the client's Inbox next to the estimates they
// actually have to turn up to. Jake's rule (2026-08-10): a client sees the
// chats for estimates we book and leads we hand off, and nothing else.
//
// Those two words are literally the first two stages of the live Willis
// "3) Sales" pipeline ("Handed Off", "Estimate Booked"), so the rule is simply:
// the contact holds an opportunity in the HAND-OFF PIPELINE. Any stage in it
// counts, including Won, Lost and Cancelled — once a lead is handed over, the
// conversation is the client's whether or not it went anywhere.
//
// The Google Reviews pipeline rides along in the same allowlist. It is NOT part
// of the hand-off rule: Reviews > Chats reads the same /api/conversations feed
// (src/routes/reviews/ReviewsChats.tsx), and a review-request contact is a past
// customer of the client's, so hard-filtering to the hand-off pipeline alone
// would blank that page. Each surface filters the feed to its own pipeline from
// the `pipelines[]` array already on every conversation.
//
// Pipelines resolve BY NAME per tenant, never by a bare id — ids differ per
// sub-account. Same exact -> contains -> known-id ladder used by
// functions/api/sales/leads/index.ts and src/lib/reviewsChats.ts.
//
// GATE-OFF IS DELIBERATE. A client whose hand-off pipeline cannot be resolved
// keeps seeing exactly what they see today. The alternative — hiding everything
// — turns a config gap into an Inbox that reads as broken, which is how the
// social-connect gate locked Willis out the day it deployed.
import { fetchContact, ghlJson, type GhlContext } from "./ghl";

export interface PipelineLike {
  id: string;
  name: string;
}

// Deliberately looser than GhlOpportunity: the GHL search response leaves both
// of these off some rows, and an opportunity missing either one cannot admit
// anybody, so the checks below treat absent as "not in scope" rather than
// forcing every caller to pre-clean the list.
export interface OpportunityLike {
  contactId?: string | null;
  pipelineId?: string | null;
}

export interface ClientInboxScope {
  // The pipeline a lead must be in for the client to see its conversation.
  handoffPipelineId: string;
  // The client's Google Reviews pipeline, or null if they have none. Additive:
  // it widens the allowlist, it is never the hand-off test.
  reviewsPipelineId: string | null;
}

// Matched against the normalized pipeline name. "3) Sales" normalizes to
// "3 sales", so the ordering prefix a client puts on their pipelines is
// harmless — but it does mean equality alone never matches, hence the ladder.
const HANDOFF_NAME = "sales";
const REVIEWS_NAME = "google reviews";

// Live Willis ids, the last resort if a pipeline is renamed past recognition.
// These only ever match Willis's own sub-account: ids are per-location, so this
// rung cannot mis-fire on another client.
export const WILLIS_HANDOFF_PIPELINE_ID = "y9riM1PGwXGhtvGTZYZJ";
export const WILLIS_REVIEWS_PIPELINE_ID = "R76ncRGrODiJuDJJTUWR";

interface PipelinesResponse {
  pipelines?: { id: string; name: string }[];
}

function norm(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(
  pipes: PipelineLike[],
  name: string,
  fallbackId: string,
): string | null {
  const hit =
    pipes.find((p) => norm(p.name) === name) ??
    pipes.find((p) => norm(p.name).includes(name)) ??
    pipes.find((p) => p.id === fallbackId);
  return hit?.id ?? null;
}

// The client's visible-pipeline scope, or null meaning "gate off, show
// everything". `overrideId` is tenants.client_inbox_pipeline_id: an admin
// naming the hand-off pipeline outright for a client who does not call theirs
// "Sales". An override that matches nothing falls through to the name ladder
// rather than disabling the gate, so a typo cannot quietly open the Inbox back
// up to the setter's work.
export function resolveClientInboxScope(
  pipelines: PipelineLike[],
  overrideId: string | null | undefined,
): ClientInboxScope | null {
  const pipes = pipelines ?? [];
  const override = overrideId?.trim()
    ? (pipes.find((p) => p.id === overrideId.trim())?.id ?? null)
    : null;
  const handoffPipelineId = override ?? pick(pipes, HANDOFF_NAME, WILLIS_HANDOFF_PIPELINE_ID);
  if (!handoffPipelineId) return null;
  return {
    handoffPipelineId,
    reviewsPipelineId: pick(pipes, REVIEWS_NAME, WILLIS_REVIEWS_PIPELINE_ID),
  };
}

function inScope(
  scope: ClientInboxScope,
  pipelineId: string | null | undefined,
): boolean {
  if (!pipelineId) return false;
  return (
    pipelineId === scope.handoffPipelineId ||
    pipelineId === scope.reviewsPipelineId
  );
}

// Every contact the client is allowed to see a conversation for. A contact
// commonly holds several opportunities at once (a past customer sits in both
// Sales and Google Reviews), so one qualifying opportunity is enough.
export function buildVisibleContactIds(
  scope: ClientInboxScope,
  opportunities: OpportunityLike[],
): Set<string> {
  const ids = new Set<string>();
  for (const o of opportunities ?? []) {
    if (o?.contactId && inScope(scope, o.pipelineId)) ids.add(o.contactId);
  }
  return ids;
}

// The single-contact form, for the thread endpoints. `opportunities` is that
// one contact's opportunities. No opportunity at all means never handed off.
export function contactIsInScope(
  scope: ClientInboxScope,
  opportunities: OpportunityLike[],
): boolean {
  return (opportunities ?? []).some((o) => inScope(scope, o.pipelineId));
}

// ---------------------------------------------------------------------------
// The tag widening (tenants.inbox_visible_tag, 0103).
//
// The rule above assumes WE work the leads and hand over the ones worth the
// client's time. For a client who rings their own, nothing is ever handed off,
// so the Inbox they are meant to reply from stays empty while their leads text
// them. This lets those contacts in by tag instead, with no opportunity needed.
//
// Additive, never subtractive: it can only widen what the hand-off rule already
// admits. Matched case-insensitively and by contains, so 'facebook ads',
// 'Facebook Ad' and 'facebook ads - july' all resolve, the same looseness
// adsRevenue.ts uses on the same tag for the same reason.

export interface TaggedContactLike {
  id?: string | null;
  tags?: string[] | null;
}

export function contactCarriesTag(
  contact: TaggedContactLike,
  tag: string | null | undefined,
): boolean {
  const needle = (tag ?? "").trim().toLowerCase();
  if (!needle) return false;
  return (contact.tags ?? []).some((t) => String(t ?? "").toLowerCase().includes(needle));
}

// Every contact carrying the tag. Empty set when the tenant has not configured
// one, which leaves the gate exactly as it was.
export function tagVisibleContactIds(
  contacts: TaggedContactLike[],
  tag: string | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!(tag ?? "").trim()) return ids;
  for (const c of contacts ?? []) {
    if (c?.id && contactCarriesTag(c, tag)) ids.add(c.id);
  }
  return ids;
}

// Union of the two rules, or null when the gate is off entirely (null means
// "show everything", and widening everything is still everything).
export function widenWithTag(
  gated: Set<string> | null,
  tagged: Set<string>,
): Set<string> | null {
  if (!gated) return null;
  if (tagged.size === 0) return gated;
  const out = new Set(gated);
  for (const id of tagged) out.add(id);
  return out;
}

export async function fetchPipelines(ctx: GhlContext): Promise<PipelineLike[]> {
  const data = await ghlJson<PipelinesResponse>(
    ctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(ctx.locationId)}`,
  );
  return (data.pipelines ?? []).map((p) => ({ id: p.id, name: p.name }));
}

interface ContactOppSearchResponse {
  opportunities?: {
    id: string;
    pipelineId: string;
    contact?: { id?: string } | null;
  }[];
}

// One contact's opportunities. Verified against the live Willis account
// 2026-08-10: /opportunities/search honours contact_id and returns only that
// contact's rows, so a thread guard costs one small call rather than a full
// pipeline scan. Note the list endpoint nests the contact, unlike the flattened
// shape fetchAllOpportunities returns.
export async function fetchContactOpportunities(
  ctx: GhlContext,
  contactId: string,
): Promise<OpportunityLike[]> {
  const data = await ghlJson<ContactOppSearchResponse>(
    ctx,
    `/opportunities/search?location_id=${encodeURIComponent(ctx.locationId)}` +
      `&contact_id=${encodeURIComponent(contactId)}&limit=100`,
  );
  return (data.opportunities ?? []).map((o) => ({
    contactId: o.contact?.id ?? contactId,
    pipelineId: o.pipelineId,
  }));
}

// The thread-endpoint guard: may this client read/reply to this contact?
//
// TRUE means allowed, and every failure path returns TRUE. A GHL hiccup must
// not make a client's own booked estimate unreadable; the feed is the primary
// filter and this is the backstop that stops a hand-typed contact id reaching a
// thread the client was never handed.
export async function isClientVisibleContact(
  ctx: GhlContext,
  overridePipelineId: string | null | undefined,
  contactId: string,
  // tenants.inbox_visible_tag (0103). Checked only when the pipeline rule says
  // no, so the common case still costs the same two calls it always did.
  visibleTag?: string | null,
): Promise<boolean> {
  try {
    const [pipelines, opportunities] = await Promise.all([
      fetchPipelines(ctx),
      fetchContactOpportunities(ctx, contactId),
    ]);
    const scope = resolveClientInboxScope(pipelines, overridePipelineId);
    if (!scope) return true;
    if (contactIsInScope(scope, opportunities)) return true;

    // The list endpoint widened by tag, so the thread behind a widened row has
    // to open. Without this a client would see a conversation in their Inbox
    // and get a 403 when they tapped it.
    if ((visibleTag ?? "").trim()) {
      const contact = await fetchContact(ctx, contactId);
      if (contact && contactCarriesTag(contact, visibleTag)) return true;
    }
    return false;
  } catch {
    return true;
  }
}
