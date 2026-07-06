import { useEffect, useMemo, useState } from "react";
import PageBar from "../PageBar";
import EmptyState from "../EmptyState";
import InboxDetail from "./InboxDetail";
import StageGroupList from "./StageGroupList";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";
import type { ApiConversation } from "../../lib/api";

// The Atelier desktop inbox (lg+). One unified, grouped-by-stage queue on the
// left (fixed column), the shared thread + composer on the right. Renders only
// inside `hidden lg:flex` from the Conversations route.
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

  // Default the selection to the most recently active conversation.
  useEffect(() => {
    if (all.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !all.some((c) => c.contactId === selectedId)) {
      const newest = [...all].sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      )[0];
      setSelectedId(newest.contactId);
    }
  }, [all, selectedId]);

  const selected = all.find((c) => c.contactId === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="px-6 pt-5">
        <PageBar tabs={[]} section="Inbox" />
      </div>

      <div className="flex min-h-0 flex-1 border-t border-border">
        {/* Grouped queue */}
        <section className="flex w-[360px] shrink-0 flex-col border-r border-border bg-surface">
          <div className="px-4 pb-1 pt-3">
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
            <StageGroupList
              items={all}
              selectedId={selectedId}
              onOpen={setSelectedId}
              search={search}
            />
          )}
        </section>

        <InboxDetail conv={selected} />
      </div>
    </div>
  );
}
