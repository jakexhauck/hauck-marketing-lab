import type { LiveDialerCall } from "./api";

// Calls this browser has already judged, held just long enough for the server
// to agree.
//
// The power dialer polls /api/admin/cold-call/live every eight seconds, and the
// outcome press writes through GoHighLevel, which takes a second or two. So
// there is a window, several seconds wide and hit most presses, where a poll
// answers with the truth as the server still knows it: that dial is PENDING.
// react-query's optimistic removal is a write into the same cache the poll
// writes into, so the poll wins and the card the caller just dealt with lands
// back on screen, in the middle of the next call.
//
// What happened next is the part Jake saw. The caller presses the outcome
// again, the server refuses the second press (the row is no longer pending, so
// it answers 409 already_recorded), the mutation's error path puts the card
// back a THIRD time, and the card sits there insisting it has not been marked
// while the database has had the answer the whole time.
//
// A tombstone survives all of that, because it is not in the cache the poll
// overwrites: a judged dial is filtered out of every live answer on the way in,
// so no poll can resurrect it however the timing falls.
//
// They expire, and that is deliberate. Once the server has the outcome the dial
// stops coming back pending at all, which makes the tombstone a no-op long
// before it lapses; the expiry is only there so nothing can be hidden for ever
// by a write that never landed.
const TOMBSTONE_MS = 30_000;

const judged = new Map<string, number>();

// A press carries the pending dial's id when the power dialer placed the call.
// When it did not (a caller working off their own handset) there is no row yet,
// and the prospect is the only handle there is.
export function dialKey(dialId: string): string {
  return `dial:${dialId}`;
}

export function leadKey(leadId: string): string {
  return `lead:${leadId}`;
}

export function markJudged(keys: (string | null | undefined)[], now = Date.now()): void {
  for (const key of keys) {
    if (key) judged.set(key, now + TOMBSTONE_MS);
  }
}

// Drop the tombstone: the write failed, so the call really is still waiting on
// an outcome and belongs back on the caller's screen.
export function unmarkJudged(keys: (string | null | undefined)[]): void {
  for (const key of keys) {
    if (key) judged.delete(key);
  }
}

export function isJudged(key: string, now = Date.now()): boolean {
  const until = judged.get(key);
  if (until === undefined) return false;
  if (until <= now) {
    judged.delete(key);
    return false;
  }
  return true;
}

// Every live answer passes through here on the way into the cache.
export function dropJudgedCalls<T extends Pick<LiveDialerCall, "dialId" | "leadId">>(
  calls: T[],
  now = Date.now(),
): T[] {
  return calls.filter(
    (call) =>
      !isJudged(dialKey(call.dialId), now) &&
      !(call.leadId && isJudged(leadKey(call.leadId), now)),
  );
}

// Tests only.
export function resetJudgedDials(): void {
  judged.clear();
}
