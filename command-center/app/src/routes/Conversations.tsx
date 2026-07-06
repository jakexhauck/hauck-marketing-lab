import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import PageBar from "../components/PageBar";
import TestBanner from "../components/TestBanner";
import SearchBar from "../components/SearchBar";
import StageGroupList from "../components/conversations/StageGroupList";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "../hooks/useApi";
import { PAGE_CONTAINER } from "../lib/layout";
import type { ApiConversation } from "../lib/api";
import { Skeleton } from "../components/ui";
import ConversationsDesktop from "../components/conversations/ConversationsDesktop";

export default function Conversations() {
  const navigate = useNavigate();
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const query = useConversationsQuery(useReal);
  const [search, setSearch] = useState("");
  const isTest = mode === "test";

  const all: ApiConversation[] = query.data?.conversations ?? [];

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <PullToRefresh queryKeys={[["conversations"]]} />
        {isTest && <TestBanner />}

        <div className={PAGE_CONTAINER}>
          <PageBar tabs={[]} section="Inbox" />

          <div className="mb-3">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search conversations"
            />
          </div>

          {query.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              Failed to load conversations.{" "}
              {(query.error as Error | null)?.message ?? "Try again."}
            </div>
          ) : query.isLoading ? (
            <ConversationsSkeleton />
          ) : all.length === 0 ? (
            <EmptyState
              title="No conversations"
              message="New leads and replies will show up here."
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <StageGroupList
                items={all}
                selectedId={null}
                onOpen={(contactId) => navigate(`/conversations/${contactId}`)}
                search={search}
              />
            </div>
          )}
        </div>
      </div>
      <div className="hidden min-h-0 flex-1 lg:flex">
        <ConversationsDesktop />
      </div>
    </Shell>
  );
}

// First-load placeholder that mirrors the conversation list shape (avatar plus
// two text lines per row) so the layout does not jump when data arrives.
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
