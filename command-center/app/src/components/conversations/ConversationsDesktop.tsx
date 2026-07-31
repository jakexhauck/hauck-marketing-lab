import { useEffect, useMemo, useState } from "react";
import PageBar from "../PageBar";
import EmptyState from "../EmptyState";
import InboxDetail from "./InboxDetail";
import ConversationList from "./ConversationList";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { DEFAULT_INBOX_TAB, conversationsForTab } from "../../lib/inboxTabs";
import type { ApiConversation } from "../../lib/api";

// The Atelier desktop inbox (lg+). The stage/source tabs sit on the same line as
// the "Inbox" title (passed as PageBar children), the active tab's flat queue on
// the left (fixed column), the shared thread + composer on the right.
// Renders only inside `hidden lg:flex` from the Conversations route.
export default function ConversationsDesktop() {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all: ApiConversation[] = useMemo(
    () => query.data?.conversations ?? [],
    [query.data],
  );

  // One flat queue, so no tab state: see the header comment below.
  const list = useMemo(
    () => conversationsForTab(all, DEFAULT_INBOX_TAB, search),
    [all, search],
  );

  // Keep a valid selection for the active tab: default to the top row, and if
  // the current pick is not in this tab's queue (tab switch, search), reselect.
  useEffect(() => {
    if (list.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !list.some((c) => c.contactId === selectedId)) {
      setSelectedId(list[0].contactId);
    }
  }, [list, selectedId]);

  const selected = list.find((c) => c.contactId === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header alone. The Inbox has no sub-pages and no filters: the strip that
          used to sit under here held a single "Inbox" tab matching every
          conversation, so it filtered nothing and repeated the title.
          PageBar's own mb-5 is the white space down to the panes. */}
      <div className="px-6 pt-5">
        <PageBar tabs={[]} section="Inbox" />
      </div>

      <div className="flex min-h-0 flex-1 border-t border-border">
        {/* Active tab's queue */}
        <section className="flex w-[360px] shrink-0 flex-col border-r border-border bg-surface">
          <div className="px-4 pb-3 pt-3">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or message"
                aria-label="Search conversations"
                className="w-full rounded-[10px] border border-border bg-brand-bg py-2 pl-9 pr-3 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
          </div>

          {query.isError ? (
            <div className="m-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
              Failed to load conversations.
            </div>
          ) : query.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div
                className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand"
                aria-hidden
              />
            </div>
          ) : all.length === 0 ? (
            <EmptyState
              title="No conversations"
              message="New leads and replies will show up here."
            />
          ) : (
            <ConversationList
              items={list}
              selectedId={selectedId}
              onOpen={setSelectedId}
              emptyLabel={
                search.trim()
                  ? "No conversations match."
                  : "Nothing in this tab yet."
              }
            />
          )}
        </section>

        <InboxDetail conv={selected} />
      </div>
    </div>
  );
}
