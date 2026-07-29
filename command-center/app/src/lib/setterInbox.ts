// Pure model helpers for the Setter Suite inbox
// (src/components/admin/setter/SetterInbox.tsx, ThreadList.tsx, ThreadView.tsx,
// Composer.tsx). No I/O, no React: the send-guard, the default channel and the
// paging accumulator are plain functions of the API's own shapes, so they stay
// unit-testable without a server or React Query.
//
// Everything here guards a send that goes straight to a real customer under the
// client's name, with no undo and no approval step. That is why the guard lives
// in a tested module rather than inline in the component.


// The two channels the composer offers. functions/lib/messaging.ts allows six
// more (FB, IG, GMB, WhatsApp, Live_Chat, Custom), but those only deliver when
// the customer already has an open conversation on that network, and a setter
// picking one blind would send into a channel the contact cannot receive. SMS
// and Email are the two that always work from a phone number and an address.
export const SEND_CHANNELS = [
  { value: "SMS", label: "SMS" },
  { value: "Email", label: "Email" },
] as const;

export type SendChannel = (typeof SEND_CHANNELS)[number]["value"];

export function isSendChannel(value: string): value is SendChannel {
  return SEND_CHANNELS.some((c) => c.value === value);
}

// Which channel the composer opens on. Reply where they reached you: the
// thread's own last message type decides, defaulting to SMS for anything that
// is not an email (a call, a review, an unmapped GHL enum stem). Mirrors the
// intent of channelMeta in functions/lib/messaging.ts without importing across
// the app/functions boundary.
export function defaultChannelFor(lastMessageType: string | null | undefined): SendChannel {
  if (typeof lastMessageType === "string" && /email/i.test(lastMessageType)) return "Email";
  return "SMS";
}

// Why the send button is disabled, in words the setter can act on, or null when
// the message is safe to send. Email without a subject is rejected by the
// endpoint with a 400 (functions/lib/messaging.ts:sendChannelMessage), so it is
// blocked here instead of bouncing the setter off the network.
export function sendBlockReason(
  channel: string,
  body: string,
  subject: string,
): string | null {
  if (!isSendChannel(channel)) return "Pick a channel before sending.";
  if (!body.trim()) return "Type a message before sending.";
  if (channel === "Email" && !subject.trim()) return "Email needs a subject line.";
  return null;
}

// Maps the send endpoint's error codes onto a sentence a setter reads while
// holding a phone. Anything unrecognised falls through to the generic line
// rather than leaking a code into the UI. The draft is never cleared on any of
// these: losing a typed message is worse than the send failing.
export function sendErrorMessage(code: unknown): string {
  switch (code) {
    case "missing_subject":
      return "That email needs a subject line, it was not sent.";
    case "missing_body":
      return "That message was empty, it was not sent.";
    case "invalid_channel":
      return "That channel cannot be used for this contact, nothing was sent.";
    case "contact_not_found":
      return "This contact no longer exists in the booking system.";
    case "send_failed":
      return "The booking system rejected that message. It may not have been delivered, check the thread before resending.";
    default:
      return "Could not send that message. Your text is still here, try again.";
  }
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

// Paging is a GROWING WINDOW read from the top, not an accumulated sequence of
// pages. "Load more" asks for a bigger window and replaces the list.
//
// This replaced a client-side accumulator that stitched offset pages together.
// The accumulator was correct about duplicates and wrong about the thing that
// matters: an offset does not address a stable row when the list re-sorts by
// recency on every request. A thread receiving a new inbound message jumps to
// index 0, every row below shifts down one, and the row that crosses the page
// boundary is never requested. It simply is not in the list, with nothing shown
// to say so, and it is by construction the thread with the freshest customer
// activity. Re-reading from the top cannot skip a row, needs no dedup, and
// deleted about sixty lines of folding logic.
//
// Cost: "load more" refetches rows already on screen. That is nearly free here,
// because the server already reads the whole prefix from the CRM to serve any
// offset; it was never fetching just one page.

// Rows added per "load more", and the first window.
export const INBOX_PAGE = 50;

// Ceiling on the window. Matches MAX_LIMIT on the endpoint, which is in turn
// bounded by how many conversations the server will pull upstream. Past this
// the honest answer is "search for them", not a longer list.
export const MAX_INBOX_WINDOW = 500;

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function isOutbound(direction: string): boolean {
  return direction.toLowerCase() === "outbound";
}

// "2026-07-21T14:05:00Z" -> "Jul 21, 2:05 PM" in the viewer's own timezone.
// Returns an empty string for an unparseable stamp so a bad row renders as
// blank rather than "Invalid Date".
export function formatMessageStamp(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A thread preview is whatever GHL had; collapse its whitespace and cap it so
// one pasted multi-line email cannot blow the row height out.
export function previewText(preview: string, max = 90): string {
  const flat = preview.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3).trimEnd()}...`;
}

// ---------------------------------------------------------------------------
// Do Not Disturb
// ---------------------------------------------------------------------------

// What the CRM knows about a contact's blocked channels. Structural rather
// than an import of ApiContactDnd so this module stays free of the API surface
// (and its tests stay free of fixtures).
export interface DndLike {
  all: boolean;
  channels: string[];
  reasons?: Record<string, string>;
}

// Whether a message on this channel is blocked. The contact-level switch
// covers everything; otherwise the channel has to be named. Case-insensitive:
// the composer's vocabulary and GHL's match only by convention.
//
// Mirrors isChannelBlocked in functions/lib/dnd.ts. The two are the same rule
// stated on each side of the wire, deliberately, as with stageNeedsDialing.
export function isChannelBlocked(
  dnd: DndLike | null | undefined,
  channel: string,
): boolean {
  if (!dnd) return false;
  if (dnd.all) return true;
  const wanted = channel.trim().toLowerCase();
  return dnd.channels.some((c) => c.toLowerCase() === wanted);
}

// The badge on a row, or null when there is nothing to say. Never returns a
// "contactable" or "all clear" label: a contact we did not see and a contact
// with nothing blocked are both silent, because the only claim worth making
// here is the one we can stand behind.
export function dndBadgeLabel(dnd: DndLike | null | undefined): string | null {
  if (!dnd) return null;
  if (dnd.all) return "Do not disturb";
  if (!dnd.channels.length) return null;
  // Two or more blocked channels would run past a 330px row, so they collapse
  // to a count. The thread header spells them out.
  if (dnd.channels.length > 2) return `${dnd.channels.length} channels off`;
  return `No ${dnd.channels.join(" or ")}`;
}

// The sentence over the composer when the picked channel will not deliver.
// Phrased as what will HAPPEN, not as a status: a setter about to press send
// needs the consequence, not the CRM's vocabulary. GHL accepts the send and
// drops it silently, which is exactly why this has to be said up front.
export function dndSendWarning(
  dnd: DndLike | null | undefined,
  channel: string,
): string | null {
  if (!isChannelBlocked(dnd, channel)) return null;
  const why = dnd?.reasons?.[channel] ?? findReason(dnd, channel);
  const base = dnd?.all
    ? `${channel} is off for this contact: they are on Do Not Disturb, so this will not reach them.`
    : `${channel} is switched off for this contact, so this will not reach them.`;
  return why ? `${base} The booking system's reason: ${why}` : base;
}

// dnd.reasons is keyed in GHL's casing, which the composer does not
// necessarily match.
function findReason(dnd: DndLike | null | undefined, channel: string): string | undefined {
  if (!dnd?.reasons) return undefined;
  const wanted = channel.trim().toLowerCase();
  for (const [k, v] of Object.entries(dnd.reasons)) {
    if (k.toLowerCase() === wanted) return v;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

// The inbox is a flat recency list, which answers "who spoke last" and nothing
// else. A setter reading it needs the other half: where this person actually
// is. So the list is cut into one group per pipeline, plus one group for the
// people who hold no opportunity at all, and every row states its stage.
//
// Grouping happens over the LOADED WINDOW, not the whole inbox. The counts are
// therefore "rows on screen", never "leads in that pipeline", and the header
// must not be phrased as the latter.

// The group for contacts with no opportunity anywhere. Not a real pipeline id,
// and prefixed so it can never collide with one.
export const NO_PIPELINE_KEY = "__no_pipeline__";
export const NO_PIPELINE_LABEL = "Not in a pipeline";

export interface InboxGroup {
  key: string;
  label: string;
  threads: InboxThreadLike[];
}

// The shape grouping actually needs, so the model does not depend on the full
// API type (and the tests do not have to build one).
export interface InboxThreadLike {
  contactId: string;
  pipelineId: string | null;
  pipelineName: string | null;
  stageName: string | null;
}

// The CRM's pipeline names carry a numbering prefix and a "Pipeline" suffix
// ("1) Lead Form Pipeline") that read as clutter on a group heading. Same rule
// as the board's pipeline tabs (src/routes/admin/SetterSuite.tsx), kept here
// rather than shared because the two labels are allowed to diverge and a
// shared helper across a route and a lib would invite one to be changed for
// the other's sake. Falls back to the raw name if stripping would empty it.
export function pipelineGroupLabel(name: string): string {
  const cleaned = name
    .replace(/^\s*\d+\)\s*/, "")
    .replace(/\s*pipeline\s*$/i, "")
    .trim();
  return cleaned || name;
}

// Sort key from the agency's numeric prefix ("1) Leads" -> 1). Unnumbered
// pipelines sort after every numbered one; a stable sort then keeps them in
// the order they first appeared in the list.
function pipelineOrder(name: string): number {
  const m = /^\s*(\d+)\)/.exec(name);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

// Cut the window into pipeline groups. Threads keep their incoming order
// inside each group, which is recency, so the newest conversation in a
// pipeline is still the first row of that group. "Not in a pipeline" is always
// last: it is the group a setter needs least often, and pinning it means its
// position never moves as pipelines come and go.
export function groupThreadsByPipeline<T extends InboxThreadLike>(
  threads: T[],
): { key: string; label: string; threads: T[] }[] {
  const groups = new Map<string, { key: string; label: string; name: string; threads: T[] }>();

  for (const t of threads) {
    const key = t.pipelineId ?? NO_PIPELINE_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: t.pipelineName ? pipelineGroupLabel(t.pipelineName) : NO_PIPELINE_LABEL,
        name: t.pipelineName ?? "",
        threads: [],
      };
      groups.set(key, group);
    }
    group.threads.push(t);
  }

  return [...groups.values()]
    .sort((a, b) => {
      if (a.key === NO_PIPELINE_KEY) return 1;
      if (b.key === NO_PIPELINE_KEY) return -1;
      return pipelineOrder(a.name) - pipelineOrder(b.name);
    })
    .map(({ key, label, threads: rows }) => ({ key, label, threads: rows }));
}
