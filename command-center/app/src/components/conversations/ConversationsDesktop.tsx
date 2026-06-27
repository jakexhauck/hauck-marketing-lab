import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { timeAgo } from "../../lib/timeAgo";
import type { ApiConversation } from "../../lib/api";

// The Atelier desktop Inbox (lg+). The phone keeps its own (NavyHero) list
// layout; this renders only inside `hidden lg:flex` from the Conversations route.
export default function ConversationsDesktop() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);
  const [search, setSearch] = useState("");

  const items: ApiConversation[] = useMemo(
    () => query.data?.conversations ?? [],
    [query.data],
  );

  const unreadTotal = useMemo(
    () => items.reduce((n, c) => n + (c.unreadCount > 0 ? c.unreadCount : 0), 0),
    [items],
  );

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return items;
    const q = trimmed.toLowerCase();
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q),
    );
  }, [items, trimmed]);

  const subtitle = query.isLoading
    ? "Loading..."
    : `${items.length} ${items.length === 1 ? "thread" : "threads"}, ${unreadTotal} unread`;

  return (
    <DesktopPage
      title="Inbox"
      subtitle={subtitle}
    >
      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or message"
          aria-label="Search conversations"
          className="w-full rounded-[var(--radius)] border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      {query.isError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load conversations.{" "}
          {(query.error as Error | null)?.message ?? "Try again."}
        </div>
      ) : query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
          <EmptyState
            title="No conversations"
            message={
              trimmed
                ? `No conversations match "${trimmed}"`
                : "Messages with your leads will show up here."
            }
          />
        </div>
      ) : (
        <ul className="fx-stagger overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
          {visible.map((c, idx) => (
            <li key={c.id} className="fx-item">
              <ConversationRow
                conv={c}
                now={now}
                isLast={idx === visible.length - 1}
                onOpen={() => navigate(`/conversations/${c.contactId}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </DesktopPage>
  );
}

function ConversationRow({
  conv,
  now,
  isLast,
  onOpen,
}: {
  conv: ApiConversation;
  now: number;
  isLast: boolean;
  onOpen: () => void;
}) {
  const hasUnread = conv.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40" +
        (isLast ? "" : " border-b border-divider") +
        (hasUnread ? " bg-brand-tint/40" : "")
      }
    >
      <div className="relative shrink-0">
        <Avatar name={conv.name} size="md" />
        {hasUnread && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand"
            aria-hidden
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div
            className={
              "min-w-0 flex-1 truncate font-display text-[14.5px] text-text " +
              (hasUnread ? "font-bold" : "font-semibold")
            }
          >
            {conv.name}
          </div>
          <span className="shrink-0 font-data text-[11.5px] text-faint tabular-nums">
            {timeAgo(conv.lastMessageAt, now)}
          </span>
        </div>
        <div
          className={
            "mt-0.5 truncate text-[12.5px] " +
            (hasUnread ? "font-medium text-text" : "text-muted")
          }
        >
          {conv.preview || (
            <span className="italic text-faint">No recent message</span>
          )}
        </div>
      </div>

      {hasUnread && (
        <span
          className="ml-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 font-data text-[10.5px] font-bold text-brand-fg tabular-nums"
          aria-label={`${conv.unreadCount} unread`}
        >
          {conv.unreadCount}
        </span>
      )}
    </button>
  );
}
