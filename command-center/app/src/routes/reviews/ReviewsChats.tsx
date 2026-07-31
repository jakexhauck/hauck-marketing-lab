import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { TAB_TRACK, TabButton } from "../../components/PageTabs";
import EmptyState from "../../components/EmptyState";
import SearchBar from "../../components/SearchBar";
import ConversationList from "../../components/conversations/ConversationList";
import InboxDetail from "../../components/conversations/InboxDetail";
import TabStripRow from "../../components/conversations/TabStripRow";
import PullToRefresh from "../../components/PullToRefresh";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { PAGE_CONTAINER } from "../../lib/layout";
import { REVIEWS_TABS } from "../../lib/pageTabs";
import {
  REVIEWS_CHAT_TABS,
  DEFAULT_REVIEWS_CHAT_TAB,
  isReviewConversation,
  reviewsStageName,
  conversationsForReviewsTab,
} from "../../lib/reviewsChats";
import type { ApiConversation } from "../../lib/api";

// The Google Reviews Chats tab: the review-request conversations with past
// customers, sliced by their live Google Reviews pipeline stage. Reuses the
// Inbox's list and thread wholesale — it is the same GHL conversation, read
// through a different pipeline — so replying here behaves exactly as it does in
// the Inbox.
export default function ReviewsChats() {
  const { session } = useAuth();
  const query = useConversationsQuery(Boolean(session));

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(DEFAULT_REVIEWS_CHAT_TAB);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all: ApiConversation[] = useMemo(
    () => query.data?.conversations ?? [],
    [query.data],
  );
  // Everyone in the Google Reviews pipeline, for the "nobody yet" empty state.
  // Without this the page would show a bare tab's empty label and read as broken
  // rather than as "no review requests are out".
  const anyReviews = useMemo(() => all.some(isReviewConversation), [all]);
  const list = useMemo(
    () => conversationsForReviewsTab(all, tab, search),
    [all, tab, search],
  );

  // Keep a valid selection for the active tab: default to the top row, and if the
  // current pick is not in this tab's queue (tab switch, search), reselect.
  useEffect(() => {
    if (list.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !list.some((c) => c.contactId === selectedId)) {
      setSelectedId(list[0].contactId);
    }
  }, [list, selectedId]);

  const selected = list.find((c) => c.contactId === selectedId) ?? null;

  return (
    <Shell>
      <MobileChats
        query={query}
        list={list}
        anyReviews={anyReviews}
        search={search}
        setSearch={setSearch}
        tab={tab}
        setTab={setTab}
      />

      <div className="hidden min-h-0 flex-1 lg:flex">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="px-6 pt-5">
            <PageBar tabs={REVIEWS_TABS} flush>
              <ReviewsChatTabs active={tab} onSelect={setTab} />
            </PageBar>
          </div>

          <div className="flex min-h-0 flex-1">
            <section className="flex w-[360px] shrink-0 flex-col border-r border-border bg-surface">
              <div className="px-4 pb-3 pt-3">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search name or message"
                />
              </div>

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
              ) : !anyReviews ? (
                <EmptyState
                  title="No review requests yet"
                  message="Start a campaign from Ask for Reviews and the replies land here."
                />
              ) : (
                <ConversationList
                  items={list}
                  selectedId={selectedId}
                  onOpen={setSelectedId}
                  emptyLabel={
                    search.trim()
                      ? "No conversations match."
                      : "Nothing at this stage yet."
                  }
                />
              )}
            </section>

            {/* Show the review stage, not whichever pipeline the backend chose */}
            <InboxDetail
              conv={selected}
              stageLabel={selected ? reviewsStageName(selected) : undefined}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

// The four live Google Reviews stages. On desktop these are PageBar children, so
// they sit on the section title's line after its page tabs, split off by a
// divider. On mobile they get their own row (TabStripRow) and so need no divider.
// Built on the shared TAB_TRACK / TabButton from PageTabs.
function ReviewsChatTabs({
  active,
  onSelect,
  mobile,
}: {
  active: string;
  onSelect: (key: string) => void;
  mobile?: boolean;
}) {
  // Its own segmented track, matching TabLinks. On desktop it sits beside the
  // section tabs inside the header panel, so the two read as two controls; the
  // hand-drawn divider that used to separate them is no longer needed, because
  // each track is now visibly its own container.
  return (
    <div className={TAB_TRACK + (mobile ? "" : " shrink-0")}>
      {REVIEWS_CHAT_TABS.map((t) => (
        <TabButton key={t.key} active={t.key === active} onClick={() => onSelect(t.key)}>
          {t.label}
        </TabButton>
      ))}
    </div>
  );
}

// Phone: the queue only. Tapping a row opens the shared conversation route, the
// same destination the Inbox uses, so there is one thread view on mobile.
function MobileChats({
  query,
  list,
  anyReviews,
  search,
  setSearch,
  tab,
  setTab,
}: {
  query: ReturnType<typeof useConversationsQuery>;
  list: ApiConversation[];
  anyReviews: boolean;
  search: string;
  setSearch: (v: string) => void;
  tab: string;
  setTab: (v: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh queryKeys={[["conversations"]]} />
      <div className={PAGE_CONTAINER}>
        <PageBar tabs={REVIEWS_TABS} />

        <TabStripRow>
          <ReviewsChatTabs active={tab} onSelect={setTab} mobile />
        </TabStripRow>

        <div className="mb-3">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search conversations"
          />
        </div>

        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load conversations.
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]"
              aria-hidden
            />
          </div>
        ) : !anyReviews ? (
          <EmptyState
            title="No review requests yet"
            message="Start a campaign from Ask for Reviews and the replies land here."
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <ConversationList
              items={list}
              selectedId={null}
              onOpen={(contactId) => navigate(`/conversations/${contactId}`)}
              emptyLabel={
                search.trim()
                  ? "No conversations match."
                  : "Nothing at this stage yet."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
