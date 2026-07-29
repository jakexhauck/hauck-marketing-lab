import { useState } from "react";
import { BellOff, ChevronDown, Search, TriangleAlert, Loader2 } from "lucide-react";
import Avatar from "../../Avatar";
import { timeAgo } from "../../../lib/timeAgo";
import { useNow } from "../../../context/NowContext";
import {
  dndBadgeLabel,
  groupThreadsByPipeline,
  previewText,
  NO_PIPELINE_KEY,
} from "../../../lib/setterInbox";
import { stageTone } from "../../../lib/setterModel";
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
  // FALSE when the server could not read the client's pipelines at all. Every
  // thread then carries a null placement for a reason that has nothing to do
  // with the contacts, so the list renders flat instead of filing the whole
  // inbox under "Not in a pipeline", which would be a confident lie about
  // every row on the screen.
  placementAvailable: boolean;
  // FALSE when the opportunity read stopped short, so somebody shown as not in
  // a pipeline may simply be past where we looked. Said out loud in the group
  // rather than asserted away, same rule as `truncated`.
  placementComplete: boolean;
}

// One thread row. Lifted out of the map so the grouped and flat lists render
// the identical row rather than two copies that can drift.
function ThreadRow({
  thread,
  selected,
  onSelect,
  now,
}: {
  thread: ApiSetterThread;
  selected: boolean;
  onSelect: (t: ApiSetterThread) => void;
  now: number;
}) {
  const dndLabel = dndBadgeLabel(thread.dnd);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(thread)}
        aria-current={selected ? "true" : undefined}
        className={
          "flex w-full items-start gap-3 border-b border-divider px-3 py-3 text-left transition-colors " +
          (selected ? "bg-brand-tint" : "hover:bg-surface-2")
        }
      >
        <Avatar name={thread.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-display text-[13.5px] font-semibold text-text">
              {thread.name}
            </span>
            <span className="font-data shrink-0 text-[11px] text-faint">
              {timeAgo(thread.lastMessageAt, now)}
            </span>
          </div>
          <p className="mt-1 truncate text-[12.5px] text-muted">
            {previewText(thread.preview) || "No message text"}
          </p>
          {(thread.stageName || dndLabel || thread.unreadCount > 0) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {/* The stage, verbatim from the CRM. This is the answer to
                  "where is this lead at" without leaving the inbox, so it is
                  never abbreviated or re-worded. */}
              {thread.stageName && (
                <span
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{
                    borderColor: `color-mix(in srgb, ${stageTone(thread.stageName)} 35%, transparent)`,
                    color: stageTone(thread.stageName),
                    backgroundColor: `color-mix(in srgb, ${stageTone(thread.stageName)} 10%, transparent)`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stageTone(thread.stageName) }}
                    aria-hidden
                  />
                  <span className="truncate">{thread.stageName}</span>
                </span>
              )}
              {/* A blocked channel outranks the stage for space: a setter can
                  look up the stage, but a message typed into a switched-off
                  channel is simply lost with no error anywhere. */}
              {dndLabel && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-danger/30 bg-danger-tint px-2 py-0.5 text-[10.5px] font-semibold text-danger"
                  title={
                    thread.dnd?.all
                      ? "This contact is on Do Not Disturb in the booking system."
                      : `Switched off in the booking system: ${thread.dnd?.channels.join(", ")}`
                  }
                >
                  <BellOff size={10} aria-hidden />
                  {dndLabel}
                </span>
              )}
              {thread.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {thread.unreadCount}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </li>
  );
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
  placementAvailable,
  placementComplete,
}: Props) {
  const now = useNow();
  // Collapsed groups, by key. Empty by default: a setter opening the inbox
  // sees everything, and hiding rows is a choice they make, never one made for
  // them. Deliberately not persisted, so a collapsed group cannot quietly
  // survive into another client's inbox and hide their conversations.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // No placement means no honest grouping, so the list stays flat and says why
  // once, at the top. Grouping on a failed lookup would put every contact
  // under "Not in a pipeline".
  const groups = placementAvailable ? groupThreadsByPipeline(threads) : [];

  return (
    <div
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:h-[calc(100dvh-9rem)] lg:w-[330px]"
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

      <div className="min-h-0 flex-1 overflow-y-auto">
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
            {!placementAvailable ? (
              <>
                <p className="flex items-start gap-1.5 border-b border-divider px-3 py-2.5 text-[11.5px] text-faint">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
                  Could not read this client&apos;s pipelines, so these
                  conversations are not grouped. The messages themselves are
                  fine.
                </p>
                <ul>
                  {threads.map((t) => (
                    <ThreadRow
                      key={t.contactId}
                      thread={t}
                      selected={t.contactId === selectedContactId}
                      onSelect={onSelect}
                      now={now}
                    />
                  ))}
                </ul>
              </>
            ) : (
              groups.map((g) => {
                const isCollapsed = collapsed[g.key] === true;
                const none = g.key === NO_PIPELINE_KEY;
                return (
                  <section key={g.key} aria-label={g.label}>
                    <h3 className="sticky top-0 z-10">
                      <button
                        type="button"
                        onClick={() => toggle(g.key)}
                        aria-expanded={!isCollapsed}
                        className="flex w-full items-center gap-2 border-b border-divider bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-3"
                      >
                        <ChevronDown
                          size={13}
                          aria-hidden
                          className={
                            "shrink-0 text-faint transition-transform " +
                            (isCollapsed ? "-rotate-90" : "")
                          }
                        />
                        <span
                          className={
                            "min-w-0 flex-1 truncate font-display text-[11.5px] font-bold uppercase tracking-[0.06em] " +
                            (none ? "text-faint" : "text-muted")
                          }
                        >
                          {g.label}
                        </span>
                        {/* Rows in THIS list, not leads in that pipeline. The
                            inbox only ever holds the loaded window, so a count
                            phrased as a pipeline total would be wrong the
                            moment the window ends. */}
                        <span className="font-data shrink-0 text-[11px] text-faint">
                          {g.threads.length}
                        </span>
                      </button>
                    </h3>
                    {!isCollapsed && (
                      <>
                        {none && !placementComplete && (
                          <p className="border-b border-divider px-3 py-2 text-[11px] text-faint">
                            Some of these may hold a pipeline place further down
                            than this client&apos;s opportunities were read.
                          </p>
                        )}
                        <ul>
                          {g.threads.map((t) => (
                            <ThreadRow
                              key={t.contactId}
                              thread={t}
                              selected={t.contactId === selectedContactId}
                              onSelect={onSelect}
                              now={now}
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                );
              })
            )}

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
