import { useEffect, useState } from "react";
import { BellOff, Loader2, MessagesSquare, Send, TriangleAlert } from "lucide-react";
import ThreadList from "../setter/ThreadList";
import ThreadView from "../setter/ThreadView";
import {
  useAgencyInboxQuery,
  useAgencySendMutation,
  useAgencyThreadQuery,
} from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import {
  INBOX_PAGE,
  MAX_INBOX_WINDOW,
  dndSendWarning,
  sendErrorMessage,
} from "../../../lib/setterInbox";
import type { ApiAgencyThread, ApiContactDnd } from "../../../lib/api";

// Operations > Inbox: Hauck Marketing's OWN GoHighLevel sub-account.
//
// Every other inbox in this app belongs to a client, so the texts the agency
// itself sends and receives (the cold call's follow-ups, a prospect answering
// hours later) were readable only inside GoHighLevel. This is that account,
// read here.
//
// SMS only. This is the account the phone works: the reply is a text, and a
// channel picker would offer three ways to do one job. A thread still renders
// whatever it already holds, so an email that landed in this account is
// readable; the answer goes out as a text.
//
// Paging is the Setter inbox's growing window, for the same reason: an offset
// into a list that re-sorts by recency silently skips the row with the freshest
// activity, which is the one row that matters.

const SEARCH_DEBOUNCE_MS = 350;

// The api layer throws with the server's error code as the message and keeps
// the parsed body alongside it. Read both: neither is guaranteed on a transport
// failure, and this is the one code the screen renders differently.
function errorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const body = (err as { body?: { error?: unknown } }).body;
  if (body && typeof body.error === "string") return body.error;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

export default function InboxTab() {
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [windowSize, setWindowSize] = useState(INBOX_PAGE);
  const [selected, setSelected] = useState<ApiAgencyThread | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput);
      setWindowSize(INBOX_PAGE);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const inboxQuery = useAgencyInboxQuery(q, windowSize);
  const data = inboxQuery.data;
  const threads = data?.threads ?? [];

  // Loading, failed and empty stay three separate answers: an in-flight or
  // failed read must never render as "nobody has messaged you".
  const listStatus = inboxQuery.isError ? "failed" : data ? "ready" : "loading";

  const threadQuery = useAgencyThreadQuery(selected?.contactId ?? null, !!selected);
  // The thread's own copy is authoritative (the same record the send hits); the
  // list row's copy fills the moment before it lands. Falls back rather than
  // defaulting to "fine": null means nobody said, and renders as no claim.
  const openDnd = threadQuery.data?.dnd ?? selected?.dnd ?? null;
  const headerDnd = openDnd && (openDnd.all || openDnd.channels.length > 0) ? openDnd : null;
  const threadStatus = !selected
    ? "ready"
    : threadQuery.isError
      ? "failed"
      : threadQuery.isPending || threadQuery.isFetching
        ? "loading"
        : "ready";

  // The credentials are missing, so there is no account to read. Said plainly
  // rather than rendering an empty inbox, which would read as "no messages".
  if (errorCode(inboxQuery.error) === "not_configured") {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
        <h3 className="font-display text-[15px] font-semibold text-text">
          The Hauck Marketing sub-account is not connected
        </h3>
        <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-muted">
          Set <code>AGENCY_GHL_LOCATION_ID</code> and <code>AGENCY_GHL_TOKEN</code> on
          Settings, then reload. They are the same pair Cold Call books meetings with.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row">
      <ThreadList
        threads={threads}
        status={listStatus}
        search={searchInput}
        onSearchChange={setSearchInput}
        searching={searchInput.trim() !== q.trim() || (!!data && !!q && inboxQuery.isFetching)}
        selectedContactId={selected?.contactId ?? null}
        onSelect={setSelected}
        onRetry={() => inboxQuery.refetch()}
        hasMore={data?.nextCursor != null && windowSize < MAX_INBOX_WINDOW}
        loadingMore={!!data && inboxQuery.isFetching}
        moreError={!!data && inboxQuery.isError}
        // Two ways this list stops short of the inbox, and both have to say so
        // or a capped read renders as a complete one: the server hit its
        // upstream cap, or the window hit its ceiling with more still beyond it.
        truncated={
          data?.truncated === true ||
          (data?.nextCursor != null && windowSize >= MAX_INBOX_WINDOW)
        }
        placementAvailable={data ? data.placementAvailable : true}
        placementComplete={data ? data.placementComplete : true}
        onLoadMore={() => {
          if (inboxQuery.isFetching) return;
          setWindowSize((n) => Math.min(n + INBOX_PAGE, MAX_INBOX_WINDOW));
        }}
      />

      <section
        className="flex min-h-[420px] w-full min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:h-[calc(100dvh-9rem)]"
        aria-label="Conversation"
      >
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <MessagesSquare size={22} className="text-faint" aria-hidden />
            <p className="text-[13.5px] text-muted">Pick a conversation to read it and reply.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-semibold text-text">
                  {threadQuery.data?.name || selected.name}
                </div>
                {threadQuery.data?.phone && (
                  <div className="mt-0.5 truncate text-[12px] text-muted">
                    {threadQuery.data.phone}
                  </div>
                )}
                {headerDnd && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-danger">
                    <BellOff size={12} className="shrink-0" aria-hidden />
                    {headerDnd.all
                      ? "On Do Not Disturb: no channel will reach them."
                      : `Switched off in the booking system: ${headerDnd.channels.join(", ")}`}
                  </div>
                )}
              </div>
            </div>

            <ThreadView
              messages={threadQuery.data?.messages ?? []}
              status={threadStatus}
              onRetry={() => threadQuery.refetch()}
            />

            <SmsComposer
              key={selected.contactId}
              contactId={selected.contactId}
              contactName={threadQuery.data?.name || selected.name}
              dnd={openDnd}
            />
          </>
        )}
      </section>
    </div>
  );
}

// The reply box. Sends a REAL text to a REAL person as Hauck Marketing, so:
// send is disabled while the request is in flight (a double-click must not text
// twice), and a failure NEVER clears the draft, because losing a typed message
// is worse than the send failing.
//
// The Do Not Disturb line WARNS and does not disable. A switched-off channel is
// the CRM's state, not a rule of this app: GHL switches SMS off automatically
// after one carrier rejection, which can be wrong about a number that has since
// changed hands. Silently dropping the text is what happens today, so saying so
// is the fix; taking the decision away is not.
function SmsComposer({
  contactId,
  contactName,
  dnd,
}: {
  contactId: string;
  contactName: string;
  dnd?: ApiContactDnd | null;
}) {
  const { showToast } = useToast();
  const send = useAgencySendMutation();
  const [body, setBody] = useState("");

  const blocked = !body.trim();
  const disabled = blocked || send.isPending;
  const dndWarning = dndSendWarning(dnd, "SMS");

  const submit = () => {
    if (disabled) return;
    send.mutate(
      { contactId, body: body.trim() },
      {
        onSuccess: (res) => {
          // Only a confirmed send clears the draft.
          setBody("");
          // The text went out either way, so this is never an error. But the
          // audit log is the only record that it happened, and a missing row
          // has to be known now rather than found later.
          if (res?.audited === false) {
            showToast(`Sent to ${contactName}, but it was NOT recorded in the audit log.`);
            return;
          }
          showToast(`Sent to ${contactName}`);
        },
        onError: (err) => showToast(sendErrorMessage(errorCode(err))),
      },
    );
  };

  return (
    <form
      className="border-t border-divider p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Above the box, not below it: the warning has to arrive before the
          decision, and a reader moves downward as they type. */}
      {dndWarning && (
        <p className="mb-2 flex items-start gap-1.5 rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-3 py-2 text-[12px] leading-snug text-danger">
          <BellOff size={13} className="mt-0.5 shrink-0" aria-hidden />
          {dndWarning}
        </p>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={send.isPending}
        placeholder={`Text ${contactName}`}
        aria-label="Message body"
        className="min-h-[76px] w-full resize-y rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50 disabled:opacity-60"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-warning">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          This sends immediately. There is no undo.
        </p>
        <button
          type="submit"
          disabled={disabled}
          title={blocked ? "Type a message before sending." : undefined}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          {send.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Send size={14} aria-hidden />
          )}
          {send.isPending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
