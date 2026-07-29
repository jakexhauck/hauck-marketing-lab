import { useEffect, useState } from "react";
import { BellOff, MessagesSquare, Trash2 } from "lucide-react";
import ThreadList from "./ThreadList";
import ThreadView from "./ThreadView";
import Composer from "./Composer";
import {
  useDeleteSetterConversation,
  useSetterInboxQuery,
  useSetterThreadQuery,
} from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import { INBOX_PAGE, MAX_INBOX_WINDOW } from "../../../lib/setterInbox";
import type { ApiSetterThread } from "../../../lib/api";

interface Props {
  tenantId: string;
  clientName: string;
  // A one-shot hand-off from the cockpit's chat button: open this contact's
  // conversation on arrival. The parent clears it via onChatHandled once
  // consumed, mirroring the Calendar tab's bookingIntent.
  chatIntent?: { contactId: string; name: string } | null;
  onChatHandled?: () => void;
}

// How long typing settles before the search actually hits the CRM. A prior
// review of this Suite caught a live CRM call per keystroke; the inbox search
// is server-side over the whole location, so it is exactly the surface that
// must not do that.
const SEARCH_DEBOUNCE_MS = 350;

// The client's whole inbox: thread list left, the conversation plus composer
// right. Everything on this screen belongs to ONE client, the one chosen in the
// picker above the Board/Inbox tabs, so the tab cannot desync from the board.
//
// Paging is a GROWING WINDOW, not an accumulator. "Load more" asks the server
// for a larger window from the top and replaces the list wholesale. There is
// therefore no client-side stitching, no dedup, and no way for a row to be
// skipped: an offset into a list that re-sorts by recency does not address a
// stable row, so a thread that gets a new inbound message and jumps to the top
// pushes another across the page boundary, where it is silently never fetched.
// The skipped row is always the one with fresh activity, which is the row a
// setter most needs to see. Re-reading from the top makes that impossible, and
// it deletes the whole class of accumulator bugs with it.
export default function SetterInbox({ tenantId, clientName, chatIntent, onChatHandled }: Props) {
  const { showToast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [windowSize, setWindowSize] = useState(INBOX_PAGE);
  const [selected, setSelected] = useState<ApiSetterThread | null>(null);
  // Two-step delete: the trash icon arms it, a labeled confirm fires it.
  // Disarms whenever the selection changes so a confirm can never land on a
  // different conversation than the one it was armed for.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteConversation = useDeleteSetterConversation();

  // Switching clients wipes the search, the window and the selection: none of
  // it means anything against a different client's inbox, and a stale selected
  // contactId would fetch a thread the new tenant does not own.
  useEffect(() => {
    setSearchInput("");
    setQ("");
    setWindowSize(INBOX_PAGE);
    setSelected(null);
  }, [tenantId]);

  // Debounced commit of the search box. The window shrinks back with it: an
  // expanded window belongs to the result set it was expanded against.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput);
      setWindowSize(INBOX_PAGE);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Consume a pending chat intent immediately with a synthetic thread stub:
  // the thread view only needs the contactId to load messages, so the
  // conversation opens without waiting for the list. The list row highlights
  // itself later by contactId match once it loads.
  useEffect(() => {
    if (!chatIntent) return;
    setSelected({
      contactId: chatIntent.contactId,
      name: chatIntent.name,
      preview: "",
      lastMessageAt: "",
      lastMessageType: "",
      unreadCount: 0,
      // The stub exists only to open the thread view immediately; it claims no
      // placement, and the real row (with its pipeline and stage) takes over
      // when the list lands.
      pipelineId: null,
      pipelineName: null,
      stageName: null,
      dnd: null,
    });
    onChatHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIntent]);

  const inboxQuery = useSetterInboxQuery(tenantId, q, windowSize, !!tenantId);

  // React Query keys on (tenant, q, windowSize), so data is never another
  // client's: a client switch changes the key and `data` is undefined until the
  // new request lands. No accumulator means no stale-key guard is needed.
  const data = inboxQuery.data;
  const threads = data?.threads ?? [];

  // Three distinct states, never collapsed. "No conversations" is only rendered
  // for a request that came back, succeeded, and was genuinely empty. `data`
  // being present is the ONLY thing that earns "ready": deriving it from flags
  // alone let a warm-cache remount paint an empty list for one frame before the
  // cached page was read.
  const listStatus = inboxQuery.isError
    ? "failed"
    : data
      ? "ready"
      : "loading";

  const fetchingMore = !!data && inboxQuery.isFetching;

  // Selection change disarms a pending delete confirm.
  useEffect(() => {
    setConfirmingDelete(false);
  }, [selected?.contactId]);

  const runDelete = () => {
    if (!selected || deleteConversation.isPending) return;
    deleteConversation.mutate(
      { tenantId, contactId: selected.contactId },
      {
        onSuccess: (res) => {
          setConfirmingDelete(false);
          setSelected(null);
          showToast(
            res.failed > 0
              ? `Deleted, but ${res.failed} conversation(s) could not be removed`
              : "Conversation deleted",
          );
        },
        onError: () => {
          setConfirmingDelete(false);
          showToast("Could not delete the conversation, please try again");
        },
      },
    );
  };

  const threadQuery = useSetterThreadQuery(tenantId, selected?.contactId ?? null, !!selected);

  // The thread's own copy is authoritative (same record the send hits), but it
  // arrives a moment after the click. The list row's copy fills that gap so the
  // warning is never missing at the instant a setter starts typing. Falls back
  // rather than defaulting to "fine": a null here means nobody said, and null
  // renders as no claim at all.
  const openDnd = threadQuery.data?.dnd ?? selected?.dnd ?? null;
  const headerDnd = openDnd && (openDnd.all || openDnd.channels.length > 0) ? openDnd : null;
  const threadStatus = !selected
    ? "ready"
    : threadQuery.isError
      ? "failed"
      : threadQuery.isPending || threadQuery.isFetching
        ? "loading"
        : "ready";

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
        loadingMore={fetchingMore}
        moreError={!!data && inboxQuery.isError}
        // Two different ways this list can stop short of the inbox, and BOTH
        // must say so or the cap renders as a complete list:
        //   1. the server hit its upstream read cap, or
        //   2. the window hit MAX_INBOX_WINDOW while the server still reports
        //      more beyond it.
        // Case 2 is the quiet one: hasMore goes false because the window cannot
        // grow, not because the list ended, so without this the last rows just
        // stop with no explanation.
        truncated={
          data?.truncated === true ||
          (data?.nextCursor != null && windowSize >= MAX_INBOX_WINDOW)
        }
        // Default TRUE while there is no response to read: the grouped list is
        // the normal shape, and flashing the "not grouped" warning on every
        // load would train setters to ignore it for the loads where it is real.
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
            <p className="text-[13.5px] text-muted">
              Pick a conversation to read it and reply as {clientName}.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-semibold text-text">
                  {threadQuery.data?.name || selected.name}
                </div>
                {/* Spelled out here, unlike the row badge, which collapses
                    three or more channels to a count. Prefers the thread's own
                    copy: it comes from the record the send will hit. */}
                {headerDnd && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-danger">
                    <BellOff size={12} className="shrink-0" aria-hidden />
                    {headerDnd.all
                      ? "On Do Not Disturb: no channel will reach them."
                      : `Switched off in the booking system: ${headerDnd.channels.join(", ")}`}
                  </div>
                )}
              </div>
              {confirmingDelete ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11.5px] font-semibold text-danger">
                    Delete forever?
                  </span>
                  <button
                    type="button"
                    onClick={runDelete}
                    disabled={deleteConversation.isPending}
                    className="rounded-[var(--radius)] bg-danger px-2.5 py-1 text-[11.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {deleteConversation.isPending ? "Deleting..." : "Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleteConversation.isPending}
                    className="rounded-[var(--radius)] bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:bg-surface-3 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  title="Delete this conversation"
                  aria-label="Delete this conversation"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-danger-tint hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <ThreadView
              messages={threadQuery.data?.messages ?? []}
              status={threadStatus}
              onRetry={() => threadQuery.refetch()}
            />

            <Composer
              key={selected.contactId}
              tenantId={tenantId}
              contactId={selected.contactId}
              contactName={threadQuery.data?.name || selected.name}
              lastMessageType={selected.lastMessageType}
              dnd={openDnd}
            />
          </>
        )}
      </section>
    </div>
  );
}
