// Cold SMS > Pipeline: putting the reply and verdict on a card. Pure and
// import-free (bar a type) so the browser can run it too: the day view reads
// the replies once and lays them over every part (2026-10-20, seven parts each
// re-reading them pushed one load past GHL's 100 calls per 10 seconds).

import type { Verdict } from "./coldSmsBoard";

export interface ReplyInfo {
  body: string;
  at: number; // epoch ms
}

export interface StoredVerdict {
  contact_id: string;
  reply_key: string;
  reply_body: string;
  verdict: Verdict;
  classified_at: string;
}

// The stamp that says which reply a stored verdict was for. The newest inbound
// message's date is enough: a new reply moves it, our own texts do not.
export function replyKey(lastInboundAt: string | number | null | undefined): string | null {
  if (lastInboundAt == null || lastInboundAt === "") return null;
  const ms = typeof lastInboundAt === "number" ? lastInboundAt : +new Date(lastInboundAt);
  return Number.isFinite(ms) ? String(ms) : null;
}

// Put the reply and verdict on each card. A fresh reply GHL has that the stored
// verdict was not for shows the reply with NO verdict yet: a stale label on a
// new message is worse than a blank one for the few seconds until it is read.
export function decorate<T extends { contactId: string; reply: ReplyInfo | null; verdict: Verdict | null }>(
  cards: T[],
  replies: Map<string, ReplyInfo>,
  stored: Map<string, StoredVerdict>,
): T[] {
  return cards.map((c) => {
    const live = replies.get(c.contactId) ?? null;
    const row = stored.get(c.contactId) ?? null;
    if (live) {
      const fresh = row && row.reply_key === replyKey(live.at);
      return { ...c, reply: live, verdict: fresh ? row!.verdict : null };
    }
    if (row) return { ...c, reply: { body: row.reply_body, at: Number(row.reply_key) || 0 }, verdict: row.verdict };
    return c;
  });
}
