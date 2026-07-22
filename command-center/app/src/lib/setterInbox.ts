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
