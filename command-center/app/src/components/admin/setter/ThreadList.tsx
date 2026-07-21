import { Search, TriangleAlert, Loader2 } from "lucide-react";
import Avatar from "../../Avatar";
import { timeAgo } from "../../../lib/timeAgo";
import { useNow } from "../../../context/NowContext";
import { previewText } from "../../../lib/setterInbox";
import type { ApiSetterThread } from "../../../lib/api";

// Loading, failed and empty are three different answers and this list renders
// them as three different things. A prior review of this Suite twice caught a
// surface showing "nothing here" while the request was still in flight or had
// already failed, which reads to a setter as "this client has no customers".
export type ListStatus = "loading" | "failed" | "ready";

interface Props {
  threads: ApiSetterThread[];
  status: ListStatus;
  search: string;
  onSearchChange: (value: string) => void;
  searching: boolean;
  selectedContactId: string | null;
  onSelect: (thread: ApiSetterThread) => void;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  // A page beyond the first failed. The pages already held stay on screen, but
  // the failure is stated rather than looking like the end of the list.
  moreError: boolean;
  // The server stopped short of reading the whole inbox. This is a FOURTH
  // answer alongside loading / failed / empty, and folding it into any of them
  // is a lie: "no matches" and "no matches in the part we searched" lead a
  // setter to opposite conclusions while they are on the phone.
  truncated: boolean;
  onLoadMore: () => void;
}

export default function ThreadList({
  threads,
  status,
  search,
  onSearchChange,
  searching,
  selectedContactId,
  onSelect,
  onRetry,
  hasMore,
  loadingMore,
  moreError,
  truncated,
  onLoadMore,
}: Props) {
  const now = useNow();

  return (
    <div
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:w-[330px]"
      aria-label="Conversations"
    >
      <div className="border-b border-divider p-3">
        <div className="pk-roster-search">
          {searching ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Search size={14} aria-hidden />
          )}
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name or phone"
            aria-label="Search conversations"
            type="search"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto lg:max-h-[calc(100dvh-14rem)]">
        {status === "loading" ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">
            Loading conversations...
          </p>
        ) : status === "failed" ? (
          <div className="m-3 rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-3 py-3">
            <p className="flex items-start gap-1.5 text-[12.5px] text-danger">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              Could not load this client&apos;s inbox.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand/40 hover:text-brand-text"
            >
              Retry
            </button>
          </div>
        ) : threads.length === 0 ? (
          // A truncated read never claims a definitive "no match". The setter is
          // told what was actually searched so they do not tell a customer they
          // are not in the system when they are simply further down the list.
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] text-faint">
              {search.trim()
                ? truncated
                  ? `No conversations matching "${search.trim()}" in the most recent part of this inbox.`
                  : `No conversations match "${search.trim()}".`
                : "No conversations in this client's inbox yet."}
            </p>
            {truncated && search.trim() !== "" && (
              <p className="mt-1.5 text-[11.5px] text-faint">
                This inbox is too large to search end to end. Older conversations
                were not checked, so this is not proof the contact is missing.
              </p>
            )}
          </div>
        ) : (
          <>
            <ul>
              {threads.map((t) => {
                const on = t.contactId === selectedContactId;
                return (
                  <li key={t.contactId}>
                    <button
                      type="button"
                      onClick={() => onSelect(t)}
                      aria-current={on ? "true" : undefined}
                      className={
                        "flex w-full items-start gap-3 border-b border-divider px-3 py-3 text-left transition-colors " +
                        (on ? "bg-brand-tint" : "hover:bg-surface-2")
                      }
                    >
                      <Avatar name={t.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate font-display text-[13.5px] font-semibold text-text">
                            {t.name}
                          </span>
                          <span className="font-data shrink-0 text-[11px] text-faint">
                            {timeAgo(t.lastMessageAt, now)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[12.5px] text-muted">
                          {previewText(t.preview) || "No message text"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {t.lastMessageType && (
                            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
                              {t.lastMessageType}
                            </span>
                          )}
                          {t.unreadCount > 0 && (
                            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {t.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {moreError && (
              <p className="flex items-start gap-1.5 px-3 pt-3 text-[12px] text-danger">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
                Could not load more conversations. This is not the end of the list.
              </p>
            )}

            {(hasMore || moreError) && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={moreError ? onRetry : onLoadMore}
                  disabled={loadingMore}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
                >
                  {loadingMore && <Loader2 size={13} className="animate-spin" aria-hidden />}
                  {loadingMore ? "Loading..." : moreError ? "Try again" : "Load more"}
                </button>
              </div>
            )}

            {/* End of what we can reach, which is NOT the same as the end of the
                inbox. Without this the cap renders as a complete list. */}
            {!hasMore && !moreError && truncated && (
              <p className="flex items-start gap-1.5 px-3 py-3 text-[12px] text-faint">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
                That is as far as this list reaches, not the end of the inbox.
                Search by name or phone to find older conversations.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
