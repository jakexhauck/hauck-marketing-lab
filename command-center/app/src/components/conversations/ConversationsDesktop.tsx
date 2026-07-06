import { useEffect, useMemo, useState } from "react";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import PageBar from "../PageBar";
import InboxDetail from "./InboxDetail";
import SourceBadge from "./SourceBadge";
import { INBOX_TABS } from "../../lib/pageTabs";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { timeAgo } from "../../lib/timeAgo";
import {
  ORIGINS,
  ORIGIN_BY_KEY,
  convChannel,
  convOrigin,
  countByOrigin,
  type ChannelKey,
  type OriginKey,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

// The Atelier desktop inbox (lg+): the "Priority Queue" layout for one channel
// page. One stream sliced by smart views (Needs reply / All / per lead source),
// sorted so the person who has waited longest sits on top, next to the shared
// InboxDetail (thread + composer). The phone keeps its own list; this renders
// only inside `hidden lg:flex` from the Conversations route.

type ViewKey = "needs" | "all" | OriginKey;

function applyView(items: ApiConversation[], view: ViewKey): ApiConversation[] {
  if (view === "needs") return items.filter((c) => c.unreadCount > 0);
  if (view === "all") return items;
  return items.filter((c) => convOrigin(c) === view);
}

// Needs-reply is sorted longest-wait-first (oldest last message on top); the
// browse views read newest-first like a normal inbox.
function sortForView(
  list: ApiConversation[],
  view: ViewKey,
): ApiConversation[] {
  const asc = view === "needs";
  return [...list].sort((a, b) => {
    const ta = new Date(a.lastMessageAt).getTime();
    const tb = new Date(b.lastMessageAt).getTime();
    return asc ? ta - tb : tb - ta;
  });
}

function searchFilter(
  list: ApiConversation[],
  q: string,
): ApiConversation[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(s) ||
      c.preview.toLowerCase().includes(s),
  );
}

export default function ConversationsDesktop({
  channel,
}: {
  channel: ChannelKey;
}) {
  const { session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);

  const [view, setView] = useState<ViewKey>("needs");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Scope to this page's channel: the SMS page shows SMS threads, the Email page
  // shows email threads. IG/Messenger fold to "other" and drop out.
  const items: ApiConversation[] = useMemo(
    () =>
      (query.data?.conversations ?? []).filter(
        (c) => convChannel(c) === channel,
      ),
    [query.data, channel],
  );

  const needsCount = useMemo(
    () => items.filter((c) => c.unreadCount > 0).length,
    [items],
  );
  const originCounts = useMemo(() => countByOrigin(items), [items]);

  // The smart-view pills: always Needs reply + All, then one pill per lead
  // source present on this page (Paid Ad / Estimate Form / Chat Widget / ...),
  // each dotted with its source color.
  const views = useMemo(() => {
    const base: { key: ViewKey; label: string; count: number; dot?: string }[] =
      [
        { key: "needs", label: "Needs reply", count: needsCount },
        { key: "all", label: "All", count: items.length },
      ];
    for (const o of ORIGINS) {
      const n = originCounts[o.key];
      if (n === 0) continue;
      base.push({ key: o.key, label: o.label, count: n, dot: o.swatch });
    }
    return base;
  }, [needsCount, items.length, originCounts]);

  const visible = useMemo(
    () => sortForView(searchFilter(applyView(items, view), search), view),
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

  const activeLabel = views.find((v) => v.key === view)?.label ?? "All";
  const sortNote = view === "needs" ? "longest wait first" : "most recent first";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-6 pt-5">
          <PageBar tabs={INBOX_TABS} />
        </div>
        {/* Smart views: one queue, sliced */}
        <div className="flex items-center gap-2 overflow-x-auto px-6 pb-3 pt-1">
        {views.map((v) => {
          const on = v.key === view;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-[12px] border px-3.5 text-[13px] font-semibold transition-colors " +
                (on
                  ? "border-brand bg-brand text-brand-fg shadow-brand"
                  : "border-border bg-surface text-muted hover:border-border-strong")
              }
            >
              {v.dot && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: v.dot }}
                  aria-hidden
                />
              )}
              {v.label}
              <span
                className={
                  "rounded-[9px] px-1.5 py-px font-data text-[11px] font-bold tabular-nums " +
                  (on ? "bg-white/20 text-brand-fg" : "bg-surface-2 text-muted")
                }
              >
                {v.count}
              </span>
            </button>
          );
        })}
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
                      : "Nothing matches this view."
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
  const origin = convOrigin(conv);
  const accent = ORIGIN_BY_KEY[origin].swatch;
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
      {/* Left edge is colored by lead source, so the queue reads by origin. */}
      <span
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: accent }}
        aria-hidden
      />
      <div className="shrink-0">
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
          <SourceBadge origin={origin} />
        </div>
      </div>
    </button>
  );
}
