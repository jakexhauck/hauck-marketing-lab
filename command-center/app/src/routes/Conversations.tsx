import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import { HeroMark, HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import BottomNav from "../components/BottomNav";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import { useConversationsQuery } from "../hooks/useApi";
import { APP_BRAND } from "../lib/appBrand";
import { timeAgo } from "../lib/timeAgo";
import type { ApiConversation } from "../lib/api";
import { Skeleton } from "../components/ui";
import ConversationsDesktop from "../components/conversations/ConversationsDesktop";

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

// Map a raw GHL message type (e.g. "TYPE_SMS", "Facebook", "Instagram DM") to a
// short, friendly channel label. Returns null for empty/unknown types so the row
// omits the badge rather than inventing a channel.
function channelLabel(raw: string | null | undefined): string | null {
  const key = (raw ?? "")
    .toLowerCase()
    .replace(/^type[_-]?/, "")
    .replace(/[^a-z]/g, "");
  if (!key) return null;
  if (key.includes("whatsapp")) return "WhatsApp";
  if (key.includes("instagram") || key === "ig") return "IG";
  if (key.includes("facebook") || key.includes("messenger") || key === "fb")
    return "FB";
  if (key.includes("email")) return "Email";
  if (key.includes("sms") || key.includes("text")) return "SMS";
  if (key.includes("call") || key.includes("phone") || key.includes("voice"))
    return "Call";
  return null;
}

export default function Conversations() {
  const navigate = useNavigate();
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const isTest = mode === "test";

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

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh queryKeys={[["conversations"]]} />
      {isTest && <TestBanner />}

      <NavyHero flushTop={isTest}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <HeroMark initials={APP_BRAND.initials} />
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-bold text-white">
                Chats
              </div>
              <div className="truncate text-[12px] text-white/60">
                {query.isLoading
                  ? "Loading..."
                  : `${items.length} ${items.length === 1 ? "thread" : "threads"}, ${unreadTotal} unread`}
              </div>
            </div>
          </div>
          <HeroIconButton
            label="Search conversations"
            onClick={() => setShowSearch((v) => !v)}
            pressed={showSearch}
          >
            <Search size={18} />
          </HeroIconButton>
        </div>
      </NavyHero>

      {(showSearch || trimmed) && (
        <div className="px-5 pt-4">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search conversations"
          />
        </div>
      )}

      <main className="mt-4 flex flex-1 flex-col px-5 pb-28">
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
              message="Messages with your leads will show up here."
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
      </main>
      </div>
      <div className="hidden min-h-0 flex-1 lg:flex">
        <ConversationsDesktop />
      </div>
      <BottomNav active="conversations" />
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
  const channel = channelLabel(conv.lastMessageType);
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
          <span className="tabular-figs shrink-0 text-[10.5px] font-semibold text-[var(--text-faint)]">
            {messageTime(conv.lastMessageAt, now)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {channel && (
            <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-[var(--text-faint)]">
              {channel}
            </span>
          )}
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
