import { CALL_MESSAGE_TYPES, type GhlCallMessage } from "./coldCallBridge";
import { countsAsDial } from "./coldCallDials";

// Following a power dialer we do not control.
//
// GoHighLevel's power dialer works a list on its own: it rings the caller, dials
// the next prospect, and moves on the instant that call ends. Nothing tells this
// app which prospect is on the phone, and there is no API that will: the dialer
// session is not exposed. What IS exposed is the wake it leaves behind. Every
// call it places lands on the prospect's conversation as a call message, with a
// timestamp, a CallSid, a status and eventually a duration.
//
// So the app reads the wake. `/conversations/search` sorted by last message date
// is one request that names the conversations that have just moved; the newest
// outbound call on one of those is the call that just happened, and the contact
// it belongs to is the business that was rung. That is the whole mechanism.
//
// It is a poll, so it lags by however often it runs, and the row it produces is
// a call that has HAPPENED rather than one in progress. That is the honest
// shape: GoHighLevel writes the message when the call starts and finalises the
// duration afterwards, so "who was that" is answerable and "who is on the line
// this second" is not, quite. The caller is at worst one prospect behind, which
// is exactly the drift this exists to remove: without it, an outcome pressed
// while the dialer has already moved on lands on the wrong business.
//
// Everything here is pure. The endpoint does the talking; these are the rules,
// kept testable because getting one of them wrong means either a call recorded
// twice or an outcome filed against somebody who was never called.

// A dial that has been placed and not yet judged. Not in DIAL_OUTCOMES on
// purpose: those six are the buttons, and this is the state a row is in before
// anybody presses one. Nothing the browser sends can claim it.
export const PENDING_OUTCOME = "pending";

// The one lead status that means the prospect has left the dialing operation
// with a meeting in the diary. It is a stored status rather than a stage on the
// Cold Calling board (a booked demo moves to the Sales pipeline), so it is
// matched by the exact string the book stores. See src/lib/coldCallStages.ts.
export const BOOKED_STATUS = "Booked";

// Is this call still waiting on somebody to say what it became?
//
// Two conditions, and the second is the one Jake asked for (2026-08-21): a
// prospect who is ALREADY BOOKED never appears on the power dialer, whoever
// rings them.
//
// The dialer follows calls, not prospects, so ringing a booked prospect (to
// confirm the meeting, say, straight from their contact record) put a card on
// screen asking what became of a call whose answer was settled days ago. There
// is no outcome to press: the six buttons all move a prospect through the
// dialing operation, and this one has left it. So the card sat there.
//
// The dial itself is untouched and still counts. A call was placed, and a call
// placed is a dial; what changes is only whether anybody is asked to judge it.
//
// A dial with no prospect behind it (the sync has seen the call but not yet
// matched the contact) is always still waiting: an unknown status is not a
// booked one, and hiding a call nobody can account for is the wrong direction.
export function awaitsOutcome(
  outcome: string,
  leadStatus: string | null | undefined,
): boolean {
  if (outcome !== PENDING_OUTCOME) return false;
  return (leadStatus ?? "").trim() !== BOOKED_STATUS;
}

// ---------------------------------------------------------------------------
// Two calls, one attempt.
//
// GoHighLevel's power dialer sometimes places a SECOND call to the same
// prospect seconds after the first. They are separate calls with separate
// CallSids, both outbound, both on that prospect's conversation: Airflow AC &
// Heating was rung at 18:36:09 for 13 seconds and again at 18:36:26 for 47
// (verified against the live account, 2026-08-25). Ten such pairs sit in the
// table across one week, every one of them inside 27 seconds.
//
// Each call becomes its own dial row, so the caller who judged the first was
// asked about the second the moment the sync noticed it, and the card they had
// just cleared came back on the next poll. That is the bug Jake reported.
//
// The row is NOT deleted and its call still counts as a dial, because the call
// was really placed. What stops is asking a human to judge the same
// conversation twice: an answer given about this prospect seconds either side
// of this call is the answer to this call too.
//
// 60 seconds. Every duplicate observed was inside 27s, and the closest genuine
// second call to a prospect (judged separately, and differently) was 99s, so
// the window has room at both ends.
export const SAME_ATTEMPT_MS = 60_000;

export interface DialMoment {
  leadId: string | null;
  dialedAtMs: number;
}

// Has this prospect already been judged, either side of this call, close enough
// that it was the same attempt?
//
// A dial with no prospect behind it is never covered: nobody can have answered
// for a call that is not yet attached to anybody, and hiding one is the wrong
// direction to be wrong in.
export function judgedNearby(
  dial: DialMoment,
  judged: DialMoment[],
  windowMs = SAME_ATTEMPT_MS,
): boolean {
  if (!dial.leadId) return false;
  return judged.some(
    (other) =>
      other.leadId === dial.leadId &&
      Math.abs(other.dialedAtMs - dial.dialedAtMs) <= windowMs,
  );
}

// How far back a sync looks. Twenty minutes covers a coffee break mid-shift
// without ever reaching back into a session that finished an hour ago and
// re-opening calls somebody has already dealt with.
export const DEFAULT_WINDOW_MINUTES = 20;

// How long a call stays "on the phone now" in the UI. Past this it is still in
// the queue waiting on an outcome, just no longer presented as the live one.
// Three minutes is longer than most cold calls and shorter than a break.
export const LIVE_WINDOW_MS = 3 * 60_000;

// At most this many conversations are opened per sync. The search is sorted
// newest first, so these are the ones that just moved; a dialer working through
// a list touches one or two per poll and this is the ceiling for a burst.
export const MAX_CONVERSATIONS_PER_SYNC = 6;

// A call already recorded by hand can be MATCHED to the call GoHighLevel
// reports, rather than duplicated by it. The two never share a clock: the row is
// written when the caller presses an outcome, which is after the call started
// and usually a little after it ended.
//
// So the window is asymmetric. A press can land a couple of minutes before the
// message GoHighLevel eventually writes appears (clock skew, a slow finalise),
// and can land many minutes after the call began, because the call itself took
// that long.
export const MATCH_BEFORE_MS = 2 * 60_000;
export const MATCH_AFTER_MS = 12 * 60_000;

// One conversation as `/conversations/search` returns it. Only the fields that
// decide anything here; the shape is GhlConversation in ghl.ts and this is
// deliberately looser, because the ONE field that matters is a documented string
// enum that arrives as a number often enough that ghl.ts says so in a comment.
export interface RecentConversation {
  id: string;
  contactId?: string | null;
  fullName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  lastMessageDate?: string | number | null;
  lastMessageType?: string | number | null;
}

// Epoch millis for a conversation's last activity, or null when it cannot be
// read. Both shapes are tolerated for the reason ghl.ts already documents: this
// field is typed as a string and arrives as a number.
export function conversationMs(conv: RecentConversation): number | null {
  const raw = conv.lastMessageDate;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// How far back one sync looks, from the query string.
//
// The absent case is decided BEFORE Number(), and that is the whole reason this
// is a function with tests rather than two lines in the handler. Number(null)
// and Number("") are both 0, and 0 is finite, so the obvious version clamps a
// missing parameter to a ONE MINUTE window: the panel then shows the call of the
// last sixty seconds and silently forgets the two before it, which is precisely
// the drift the feature exists to remove. It shipped that way for an hour and
// was caught by running it, not by reading it.
export function readWindowMinutes(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_WINDOW_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_MINUTES;
  return Math.min(MAX_WINDOW_MINUTES, Math.max(1, Math.trunc(n)));
}

// Past two hours a sync starts reopening calls somebody dealt with in a
// previous session, so the ceiling is part of the design rather than a guard.
export const MAX_WINDOW_MINUTES = 120;

// A dial already in the table, as the sync needs to see it.
export interface KnownDial {
  id: string;
  // The GHL contact the dial's lead maps to, null when the lead was never
  // pushed to GoHighLevel.
  contactId: string | null;
  callMessageId: string | null;
  dialedAtMs: number;
}

export type CallMatch =
  | { kind: "known" }
  | { kind: "stamp"; dialId: string }
  | { kind: "new" };

// What to do with a call GoHighLevel is reporting.
//
//   known — this exact message is already a row. Nothing. This is the common
//           case on every poll after the first and is why the sync is cheap.
//   stamp — the caller already recorded this call by hand (they pressed an
//           outcome for that prospect, at about that time, and the row carries
//           no message id). It is the SAME call, so it is stamped rather than
//           duplicated, and the row gains a duration it would never have had.
//   new   — a call nobody has recorded. The dialer placed it and moved on.
//
// The order matters: message id first, because it is an identity rather than an
// inference, and a hand-written row is only ever matched when no id says
// otherwise.
export function matchCall(
  known: KnownDial[],
  call: { callMessageId: string; contactId: string; atMs: number },
): CallMatch {
  for (const row of known) {
    if (row.callMessageId && row.callMessageId === call.callMessageId) {
      return { kind: "known" };
    }
  }

  let best: KnownDial | null = null;
  let bestGap = Infinity;
  for (const row of known) {
    if (row.callMessageId) continue;
    if (row.contactId !== call.contactId) continue;
    const gap = row.dialedAtMs - call.atMs;
    if (gap < -MATCH_BEFORE_MS || gap > MATCH_AFTER_MS) continue;
    const distance = Math.abs(gap);
    if (distance < bestGap) {
      best = row;
      bestGap = distance;
    }
  }

  return best ? { kind: "stamp", dialId: best.id } : { kind: "new" };
}

// Which conversations are worth opening this sync.
//
// Two filters and a cap. A conversation with no contact cannot be attributed to
// anybody, one that has not moved inside the window has nothing new in it, and
// one whose newest activity we already hold a call row for is a message we have
// already read. That last test is what keeps a steady poll at a single request:
// during a run of calls to the same list, the top of the search is a
// conversation whose call is already in the table.
//
// The minute of slack on that test exists because the two timestamps come from
// different fields (the conversation's last-message date and the message's own
// dateAdded) and GoHighLevel does not promise they are the same instant.
export function conversationsToOpen(
  convs: RecentConversation[],
  known: KnownDial[],
  sinceMs: number,
  limit = MAX_CONVERSATIONS_PER_SYNC,
): RecentConversation[] {
  const newestKnownByContact = new Map<string, number>();
  for (const row of known) {
    if (!row.callMessageId || !row.contactId) continue;
    const at = newestKnownByContact.get(row.contactId);
    if (at === undefined || row.dialedAtMs > at) {
      newestKnownByContact.set(row.contactId, row.dialedAtMs);
    }
  }

  return convs
    .filter((conv) => Boolean(conv.id) && Boolean(conv.contactId))
    .map((conv) => ({ conv, at: conversationMs(conv) }))
    .filter((row): row is { conv: RecentConversation; at: number } => row.at !== null)
    .filter((row) => row.at >= sinceMs)
    .filter((row) => {
      const seen = newestKnownByContact.get(row.conv.contactId as string);
      return seen === undefined || row.at > seen + 60_000;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((row) => row.conv);
}

// Every outbound call on a conversation since a moment, oldest first.
//
// Oldest first because they are written in that order: a burst caught by one
// poll should land in the table in the order the phone made them, so the queue
// waiting for an outcome reads the way the shift happened.
//
// Both call message types, for the reason coldCallBridge.ts documents: a call
// dialled by hand is TYPE_CALL and a call placed by a workflow, which is what
// the power dialer's are, is TYPE_CAMPAIGN_CALL. Matching one of them was a
// whole feature that silently did nothing.
export function outboundCallsSince(
  messages: GhlCallMessage[],
  sinceMs: number,
): { message: GhlCallMessage; atMs: number }[] {
  const out: { message: GhlCallMessage; atMs: number }[] = [];
  for (const message of messages) {
    const type = (message.messageType ?? "") as (typeof CALL_MESSAGE_TYPES)[number];
    if (!CALL_MESSAGE_TYPES.includes(type)) continue;
    if ((message.direction ?? "") !== "outbound") continue;
    const atMs = Date.parse(message.dateAdded ?? "");
    if (!Number.isFinite(atMs)) continue;
    if (atMs < sinceMs) continue;
    out.push({ message, atMs });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

// The name to file a brand new prospect under, from whatever GoHighLevel holds.
//
// A power dialer can be pointed at a list this app has never seen, so the first
// this side hears of a business is the call itself. Refusing to record that call
// because the prospect is not in the book would lose the one thing worth
// keeping, so the prospect is created from the contact instead.
export function splitContactName(full: string): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Is this call the one happening now, as far as anybody can tell from a poll.
export function isLiveCall(atMs: number, now: number, windowMs = LIVE_WINDOW_MS): boolean {
  return now - atMs <= windowMs && now - atMs >= -60_000;
}

// ---------------------------------------------------------------------------
// The day's dials, while the day is still being worked.
//
// Every call is already a row: the six outcome buttons write one, and the sync
// above writes one for anything GoHighLevel's dialer placed that nobody has
// judged yet. This turns those rows into the only number a caller mid-shift
// actually wants, which is how many calls have been made, and by whom.
//
// It does not count a call to a business that is not in one of our trades: that
// is the one outcome the day's number leaves out, and coldCallDials.ts owns the
// rule so this and the tracker cannot disagree about it.
//
// It counts PENDING rows too, and that is the point. A call the phone system
// reported provably happened; whether anybody picked up is a separate question,
// and it is the one the waiting panel exists to ask. A count that waited for the
// press would read low all shift and then jump, which is worse than no count.
//
// Pure, and given the rows rather than a query, because the endpoint already
// holds a client and this is the part worth being sure about.
export interface DialTallyRow {
  callerId: string;
  name: string;
  dials: number;
}

export interface DialTally {
  // The agency's day, not the browser's: the row's own `day` column decides it,
  // so a call at 11.58pm belongs to the shift that made it.
  day: string;
  total: number;
  callers: DialTallyRow[];
}

export function tallyDials(
  rows: { caller_id: string | null; outcome: string | null }[],
  names: Map<string, string>,
  day: string,
): DialTally {
  // Wrong-trade numbers are dropped before anything is counted (0117), so the
  // total and every caller's line are the same number, filtered once.
  const dials = rows.filter((row) => countsAsDial(row.outcome));

  const counts = new Map<string, number>();
  for (const row of dials) {
    // A dial whose caller has since been deleted still happened, so it is in the
    // total. It has nobody to sit under, which is the honest shape.
    const id = (row.caller_id ?? "").trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const callers: DialTallyRow[] = [...counts.entries()]
    .map(([callerId, dials]) => ({
      callerId,
      name: (names.get(callerId) ?? "").trim() || "Unknown caller",
      dials,
    }))
    // Busiest first, and a name to break a tie, so the order does not shuffle
    // under somebody watching it between two polls.
    .sort((a, b) => b.dials - a.dials || a.name.localeCompare(b.name));

  return { day, total: dials.length, callers };
}
