// Cold SMS panel: texts shown the instant Send is hit (Jake, 2026-10-13: as
// little chat delay as possible). Each one sits in the thread as "sending" until
// GHL takes it, then stays until the thread read back from GHL carries it, so
// the bubble never blinks out between the send and the refresh.

export interface PendingText {
  tempId: string;
  body: string;
  at: string; // ISO, when Send was hit
  status: "sending" | "sent" | "failed";
  messageId?: string | null;
}

interface ThreadText {
  id: string;
  body: string;
  direction: string;
  at: string;
}

// GHL can stamp a message a little before our clock does; allow for it.
const SKEW_MS = 2 * 60_000;

// True when the thread read back from GHL already has this text: by the id GHL
// gave the send, else (no id came back) an outbound text with the same words
// from around the same time.
export function landed(p: PendingText, thread: ThreadText[]): boolean {
  if (p.status !== "sent") return false;
  if (p.messageId && thread.some((m) => m.id === p.messageId)) return true;
  const since = +new Date(p.at) - SKEW_MS;
  return thread.some(
    (m) => m.direction === "outbound" && m.body.trim() === p.body.trim() && +new Date(m.at) >= since,
  );
}

export function stillPending(pending: PendingText[], thread: ThreadText[]): PendingText[] {
  return pending.filter((p) => !landed(p, thread));
}
