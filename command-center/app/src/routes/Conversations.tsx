import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import TestBanner from "../components/TestBanner";
import PageBar from "../components/PageBar";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import SourceBadge from "../components/conversations/SourceBadge";
import { convChannel, convOrigin, type ChannelKey } from "../lib/inboxFilters";
import { INBOX_TABS } from "../lib/pageTabs";
import { PAGE_CONTAINER } from "../lib/layout";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import { useConversationsQuery } from "../hooks/useApi";
import { timeAgo } from "../lib/timeAgo";
import type { ApiConversation } from "../lib/api";
import { Skeleton } from "../components/ui";
import ConversationsDesktop from "../components/conversations/ConversationsDesktop";

// The Inbox is two channel pages sharing this component: /conversations/sms and
// /conversations/email. The path picks which channel this render shows.
export function pageChannelFromPath(pathname: string): ChannelKey {
  return pathname.endsWith("/email") ? "email" : "sms";
}

// One day in ms. Below this we show a relative time ("3m ago"); above it the
// relative figure stops being useful, so we fall back to an absolute short date
// ("Jun 22"), matching how the rest of the app formats older timestamps.
const DAY_MS = 24 * 60 * 60 * 1000;

function messageTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  if (now - then < DAY_MS) return timeAgo(iso, now);
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function Conversations() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const channel = pageChannelFromPath(pathname);
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);
  const [search, setSearch] = useState("");
  const isTest = mode === "test";
  const channelNoun = channel === "email" ? "emails" : "texts";

  // Scope the list to this page's channel: the SMS page shows SMS threads, the
  // Email page shows email threads. IG/Messenger fold to "other" and drop out.
  const items: ApiConversation[] = useMemo(
    () =>
      (query.data?.conversations ?? []).filter(
        (c) => convChannel(c) === channel,
      ),
    [query.data, channel],
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

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <PullToRefresh queryKeys={[["conversations"]]} />
        {isTest && <TestBanner />}

        <div className={PAGE_CONTAINER}>
          <PageBar tabs={INBOX_TABS} />

          <div className="mb-4 shrink-0">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={`Search ${channelNoun}`}
            />
          </div>

          {query.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              Failed to load conversations.{" "}
              {(query.error as Error | null)?.message ?? "Try again."}
            </div>
          ) : query.isLoading ? (
            <ConversationsSkeleton />
          ) : visible.length === 0 ? (
            trimmed ? (
              <EmptyState
                title="No conversations"
                message={`No conversations match "${trimmed}"`}
              />
            ) : (
              <EmptyState
                title="No conversations"
                message={`Your ${channelNoun} with leads will show up here.`}
              />
            )
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {visible.map((c, idx) => (
                <li key={c.id}>
                  <ConversationRow
                    conv={c}
                    isLast={idx === visible.length - 1}
                    onTap={() => navigate(`/conversations/${c.contactId}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="hidden min-h-0 flex-1 lg:flex">
        <ConversationsDesktop channel={channel} />
      </div>
    </Shell>
  );
}

interface ConversationRowProps {
  conv: ApiConversation;
  isLast: boolean;
  onTap: () => void;
}

function ConversationRow({ conv, isLast, onTap }: ConversationRowProps) {
  const now = useNow();
  const hasUnread = conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onTap}
      className={
        "flex w-full items-center gap-3 bg-[var(--surface)] px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
        (isLast ? "" : " border-b border-[var(--divider)]")
      }
      style={{ minHeight: "68px" }}
    >
      <Avatar name={conv.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-[var(--text)]">
            {conv.name}
          </div>
          <span className="tabular-figs shrink-0 text-[11px] font-semibold text-[var(--text-faint)]">
            {messageTime(conv.lastMessageAt, now)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
          <div
            className={
              "min-w-0 flex-1 truncate text-xs " +
              (hasUnread
                ? "font-semibold text-[var(--text)]"
                : "text-[var(--text-faint)]")
            }
          >
            {conv.preview || (
              <span className="italic text-[var(--text-faint)]">
                No recent message
              </span>
            )}
          </div>
          {hasUnread && (
            <span
              className="ml-2 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// First-load placeholder that mirrors the conversation list shape (avatar plus
// two text lines per row) so the layout does not jump when data arrives. Shown
// only on the initial load, not on background refetches.
function ConversationsSkeleton() {
  return (
    <ul
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
      aria-busy="true"
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <li
          key={i}
          className={
            "flex items-center gap-3 px-4 py-3.5" +
            (i === 6 ? "" : " border-b border-[var(--divider)]")
          }
          style={{ minHeight: "68px" }}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-10" />
            </div>
            <Skeleton className="h-3 w-[60%]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
