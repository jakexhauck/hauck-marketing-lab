import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageBar from "../PageBar";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import InboxDetail from "./InboxDetail";
import SourceBadge from "./SourceBadge";
import InboxFilterPills from "./InboxFilterPills";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { INBOX_TABS } from "../../lib/pageTabs";
import { timeAgo } from "../../lib/timeAgo";
import {
  applyInboxView,
  convOrigin,
  pageChannelFromPath,
  pageChannelOf,
  sendLabelForChannel,
  sortForInboxView,
  type InboxView,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

// The Atelier desktop inbox (lg+). Each page (SMS or Email) is a standard PageBar
// surface scoped to one channel: the priority queue on the left, sliced by lead
// source, next to the shared InboxDetail (thread + composer). The phone keeps its
// own list; this renders only inside `hidden lg:flex` from the Conversations
// route.

function searchFilter(list: ApiConversation[], q: string): ApiConversation[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(s) || c.preview.toLowerCase().includes(s),
  );
}

export default function ConversationsDesktop() {
  const { session } = useAuth();
  const now = useNow();
  const location = useLocation();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);

  const channel = pageChannelFromPath(location.pathname);
  const [view, setView] = useState<InboxView>("needs");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all: ApiConversation[] = useMemo(
    () => query.data?.conversations ?? [],
    [query.data],
  );

  // Scope to this page's channel first; everything else works within it.
  const items = useMemo(
    () => all.filter((c) => pageChannelOf(c) === channel),
    [all, channel],
  );

  const needsCount = useMemo(
    () => items.filter((c) => c.unreadCount > 0).length,
    [items],
  );

  const visible = useMemo(
    () =>
      sortForInboxView(searchFilter(applyInboxView(items, view), search), view),
    [items, view, search],
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

  const activeLabel =
    view === "needs" ? "Needs reply" : view === "all" ? "All" : "Filtered";
  const sortNote = view === "needs" ? "longest wait first" : "most recent first";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="px-6 pt-5">
        <PageBar
          tabs={INBOX_TABS}
          filters={
            <InboxFilterPills items={items} active={view} onChange={setView} />
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 border-t border-border">
        {/* Priority queue */}
        <section className="flex w-[380px] shrink-0 flex-col border-r border-border bg-surface">
          <div className="px-4 pb-2 pt-3">
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

          <div className="flex items-center justify-between px-4 pb-2">
            <div className="font-display text-[12.5px] font-semibold text-text">
              {activeLabel}{" "}
              <span className="font-body font-normal text-faint">
                · sorted by {sortNote}
              </span>
            </div>
            {view === "needs" && needsCount > 0 && (
              <span className="rounded-full bg-positive-tint px-2 py-0.5 font-data text-[10.5px] font-bold text-positive tabular-nums">
                {needsCount} to clear
              </span>
            )}
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
                title={
                  view === "needs" ? "You're all caught up" : "No conversations"
                }
                message={
                  search.trim()
                    ? `No conversations match "${search.trim()}"`
                    : view === "needs"
                      ? "Nothing is waiting on a reply right now."
                      : `No ${sendLabelForChannel(channel)} conversations yet.`
                }
              />
            ) : (
              <ul>
                {visible.map((c) => (
                  <li key={c.id}>
                    <QueueCard
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

        <InboxDetail conv={selected} channel={channel} />
      </div>
    </div>
  );
}

// Wait state for an unread conversation: hot (<30m) / warm (<2h) / cool.
function waitClass(iso: string, now: number): string {
  const min = (now - new Date(iso).getTime()) / 60000;
  if (min < 30) return "bg-danger-tint text-danger";
  if (min < 120) return "bg-warning-tint text-warning";
  return "bg-surface-2 text-faint";
}

function QueueCard({
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
        "relative flex w-full gap-3 border-b border-divider py-3 pl-5 pr-4 text-left transition-colors " +
        (active ? "bg-brand-tint" : "hover:bg-surface-2")
      }
    >
      <div className="relative shrink-0">
        <Avatar name={conv.name} size="md" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "min-w-0 flex-1 truncate font-display text-[14px] text-text " +
              (hasUnread ? "font-bold" : "font-semibold")
            }
          >
            {conv.name}
          </span>
          {hasUnread ? (
            <span
              className={
                "shrink-0 rounded-full px-2 py-0.5 font-data text-[10px] font-bold tabular-nums " +
                waitClass(conv.lastMessageAt, now)
              }
            >
              {timeAgo(conv.lastMessageAt, now)}
            </span>
          ) : (
            <span className="shrink-0 font-data text-[10.5px] text-faint tabular-nums">
              {timeAgo(conv.lastMessageAt, now)}
            </span>
          )}
        </div>

        <div
          className={
            "mt-1 truncate text-[12.5px] " +
            (hasUnread ? "text-text" : "text-muted")
          }
        >
          {conv.preview || "No recent message"}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
        </div>
      </div>
    </button>
  );
}
