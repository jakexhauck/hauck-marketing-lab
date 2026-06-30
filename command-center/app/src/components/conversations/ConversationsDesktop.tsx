import { useEffect, useMemo, useState } from "react";
import DesktopPage from "../desktop/DesktopPage";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import InboxFilterRail from "./InboxFilterRail";
import InboxDetail from "./InboxDetail";
import SourceBadge from "./SourceBadge";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { timeAgo } from "../../lib/timeAgo";
import {
  convOrigin,
  filterConversations,
  type ChannelKey,
  type OriginKey,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

// The Atelier desktop Unified Inbox (lg+): a three-pane layout (channel +
// source filter rail, conversation list, inline detail). The phone keeps its
// own (NavyHero) list; this renders only inside `hidden lg:flex` from the
// Conversations route.
export default function ConversationsDesktop() {
  const { session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);

  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const [source, setSource] = useState<OriginKey | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items: ApiConversation[] = useMemo(
    () => query.data?.conversations ?? [],
    [query.data],
  );

  const visible = useMemo(
    () => filterConversations(items, { channel, source, search }),
    [items, channel, source, search],
  );

  // Keep a valid selection: default to the first visible row, and re-pick when
  // filtering removes the current one.
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((c) => c.contactId === selectedId)) {
      setSelectedId(visible[0].contactId);
    }
  }, [visible, selectedId]);

  const selected = visible.find((c) => c.contactId === selectedId) ?? null;

  const unreadTotal = items.reduce(
    (n, c) => n + (c.unreadCount > 0 ? c.unreadCount : 0),
    0,
  );
  const subtitle = query.isLoading
    ? "Loading..."
    : `${items.length} ${items.length === 1 ? "thread" : "threads"}, ${unreadTotal} unread`;

  return (
    <DesktopPage title="Inbox" subtitle={subtitle} flush>
      <div className="flex min-h-0 flex-1">
        <InboxFilterRail
          items={items}
          channel={channel}
          source={source}
          onChannel={setChannel}
          onSource={setSource}
        />

        {/* Conversation list */}
        <section className="flex w-[330px] shrink-0 flex-col border-r border-border bg-surface">
          <div className="px-4 pb-2 pt-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or message"
              aria-label="Search conversations"
              className="w-full rounded-[10px] border border-border bg-brand-bg px-3 py-2 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
            ) : visible.length === 0 ? (
              <EmptyState
                title="No conversations"
                message={
                  search.trim()
                    ? `No conversations match "${search.trim()}"`
                    : "Nothing matches these filters."
                }
              />
            ) : (
              <ul>
                {visible.map((c) => (
                  <li key={c.id}>
                    <ConvRow
                      conv={c}
                      now={now}
                      active={c.contactId === selectedId}
                      onOpen={() => setSelectedId(c.contactId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <InboxDetail conv={selected} />
      </div>
    </DesktopPage>
  );
}

function ConvRow({
  conv,
  now,
  active,
  onOpen,
}: {
  conv: ApiConversation;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const hasUnread = conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "flex w-full gap-3 border-b border-divider px-4 py-3 text-left transition-colors " +
        (active
          ? "bg-brand-tint/60 shadow-[inset_3px_0_0_var(--brand-primary)]"
          : "hover:bg-surface-2")
      }
    >
      <Avatar name={conv.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "min-w-0 flex-1 truncate font-display text-[13px] text-text " +
              (hasUnread ? "font-bold" : "font-semibold")
            }
          >
            {conv.name}
          </span>
          <span className="shrink-0 font-data text-[10.5px] text-faint tabular-nums">
            {timeAgo(conv.lastMessageAt, now)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-faint">
          {conv.preview || "No recent message"}
        </div>
        <div className="mt-1.5">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
        </div>
      </div>
      {hasUnread && (
        <span className="ml-1 mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 font-data text-[10px] font-bold text-brand-fg tabular-nums">
          {conv.unreadCount}
        </span>
      )}
    </button>
  );
}
