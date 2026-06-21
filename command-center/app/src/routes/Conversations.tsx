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
import ConversationsDesktop from "../components/conversations/ConversationsDesktop";

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
          <div className="flex flex-1 items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]"
              aria-hidden="true"
            />
          </div>
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
            {timeAgo(conv.lastMessageAt, now)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
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
