import { useState } from "react";
import { LayoutGrid, Plus, Trash2, MessageCircle, ChevronDown } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { SOCIAL_TABS } from "../../lib/pageTabs";
import { Panel, Badge, Button, EmptyState, Segmented } from "../../components/ui";
import type { Tone } from "../../lib/status";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import {
  Platform,
  PlatformGlyph,
  NotConnectedNotice,
  ConnectedEmptyNotice,
  statusBadge,
  SOCIAL_CONTAINER,
} from "./shared";
import { useSocialAccounts, useSocialPosts, useDeletePost } from "../../hooks/useSocial";
import {
  postsByBucket,
  postTitle,
  primaryPlatform,
  platformNames,
  formatDateTime,
  formatDate,
} from "../../lib/social";
import SocialComposerDialog from "../../components/social/SocialComposerDialog";
import PostEngagement, { type PostComment } from "../../components/social/PostEngagement";

// The client's own pipeline of posts. Demo shows sample posts per status; a real
// session reads live posts, bucketed by status. Delete is a real (gated) write in
// a live session; the demo keeps its in-memory filter + toast. Posted items
// expand to show likes/comments (see PostEngagement): demo shows sample
// engagement, a real session shows an honest "connecting your accounts" note
// until the engagement source is wired.

type Status = "scheduled" | "drafts" | "posted";
type Engagement = { likes: number; comments: PostComment[] };
type DemoPost = {
  platform: Platform;
  title: string;
  meta: string;
  badge?: { tone: Tone; label: string };
};

const POSTS: Record<Status, DemoPost[]> = {
  scheduled: [
    {
      platform: "ig",
      title: "Same-day hot water, Thompson job",
      meta: "Sat 6:00 PM · Instagram + Facebook",
      badge: { tone: "brand", label: "Scheduled" },
    },
    {
      platform: "fb",
      title: "AC tune-up before the heat wave",
      meta: "Sun 9:00 AM · Facebook",
      badge: { tone: "brand", label: "Scheduled" },
    },
  ],
  drafts: [
    {
      platform: "gb",
      title: "Drain mistake every homeowner makes",
      meta: "Draft",
      badge: { tone: "warning", label: "Needs a photo" },
    },
  ],
  posted: [
    { platform: "ig", title: "5★ review from the Garcias", meta: "Jun 14 · Instagram" },
    { platform: "fb", title: "Burst pipe save, before/after", meta: "Jun 9 · Facebook" },
    { platform: "ig", title: "Water heater swap", meta: "Jun 2 · Instagram" },
  ],
};

// Sample likes/comments for the demo posted items, keyed by title.
const DEMO_ENGAGEMENT: Record<string, Engagement> = {
  "5★ review from the Garcias": {
    likes: 96,
    comments: [
      { id: "c1", author: "Dana W.", text: "You guys were amazing, thank you!", when: "2d" },
      { id: "c2", author: "Marco P.", text: "Do you cover the east side too?", when: "1d" },
    ],
  },
  "Burst pipe save, before/after": {
    likes: 74,
    comments: [{ id: "c3", author: "Kim R.", text: "This is why we call you every time.", when: "5d" }],
  },
  "Water heater swap": {
    likes: 61,
    comments: [{ id: "c4", author: "Ted A.", text: "What brand did you install?", when: "1w" }],
  },
};

const EMPTY_COPY: Record<Status, string> = {
  scheduled: "Posts you schedule will line up here, ready to publish.",
  drafts: "Drafts you start wait here until you post them.",
  posted: "Published posts will appear here.",
};

// A uniform row the list renders, whether the source is a demo constant or a
// real post.
interface Row {
  key: string;
  platform: Platform;
  title: string;
  meta: string;
  badge?: { tone: Tone; label: string };
  posted?: boolean;
  engagement?: Engagement;
  onClick?: () => void;
  onDelete: () => void;
}

export default function SocialPosts() {
  const demo = demoMode();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Status>("scheduled");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeSource, setComposeSource] = useState<string | undefined>(undefined);
  const [demoPosts, setDemoPosts] = useState<Record<Status, DemoPost[]>>(POSTS);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const accountsQ = useSocialAccounts(!demo);
  const postsQ = useSocialPosts({}, !demo);
  const deletePost = useDeletePost();

  const connected = accountsQ.data?.connected ?? false;
  const buckets = postsByBucket(postsQ.data?.posts ?? []);
  const realTotal = postsQ.data?.posts.length ?? 0;

  function openNew() {
    setComposeSource(undefined);
    setComposerOpen(true);
  }
  function editPost(title: string) {
    setComposeSource(title);
    setComposerOpen(true);
  }
  function removeDemoPost(status: Status, title: string) {
    setDemoPosts((prev) => ({ ...prev, [status]: prev[status].filter((p) => p.title !== title) }));
    showToast("Removed (demo)");
  }
  function removeRealPost(id: string) {
    deletePost.mutate(
      { id },
      {
        onSuccess: () => showToast("Post deleted"),
        onError: () => showToast("Could not delete that post"),
      },
    );
  }
  function toggleExpand(key: string) {
    setExpandedKey((k) => (k === key ? null : key));
  }

  const counts: Record<Status, number> = demo
    ? { scheduled: demoPosts.scheduled.length, drafts: demoPosts.drafts.length, posted: demoPosts.posted.length }
    : { scheduled: buckets.scheduled.length, drafts: buckets.drafts.length, posted: buckets.posted.length };

  const options = [
    { value: "scheduled" as const, label: "Scheduled", count: counts.scheduled },
    { value: "drafts" as const, label: "Drafts", count: counts.drafts },
    { value: "posted" as const, label: "Posted", count: counts.posted },
  ];

  const rows: Row[] = demo
    ? demoPosts[tab].map((p) => ({
        key: p.title,
        platform: p.platform,
        title: p.title,
        meta: p.meta,
        badge: p.badge,
        posted: tab === "posted",
        engagement: tab === "posted" ? DEMO_ENGAGEMENT[p.title] : undefined,
        onClick: tab === "posted" ? undefined : () => editPost(p.title),
        onDelete: () => removeDemoPost(tab, p.title),
      }))
    : (tab === "scheduled" ? buckets.scheduled : tab === "drafts" ? buckets.drafts : buckets.posted).map(
        (p) => ({
          key: p.id,
          platform: primaryPlatform(p),
          title: postTitle(p),
          meta: [
            p.status === "posted" ? formatDate(p.publishedAt) : formatDateTime(p.scheduleAt),
            platformNames(p.platforms),
          ]
            .filter(Boolean)
            .join(" · "),
          badge: p.status === "posted" ? undefined : statusBadge(p.status),
          posted: p.status === "posted",
          // Real per-post engagement is not fetchable until the source is wired.
          engagement: undefined,
          onDelete: () => removeRealPost(p.id),
        }),
      );

  return (
    <Shell>
      <SocialComposerDialog
        open={composerOpen}
        sourceIdea={composeSource}
        onClose={() => setComposerOpen(false)}
      />
      <div className={SOCIAL_CONTAINER}>
        <PageBar
          tabs={SOCIAL_TABS}
          description="Everything you've scheduled, drafted, and published."
          actions={
            <Button variant="primary" size="md" onClick={openNew}>
              <Plus size={16} /> New Post
            </Button>
          }
        />

        {!demo && !connected && (
          <NotConnectedNotice message="Your posts live here once you can publish. Connect your social accounts to get started." />
        )}
        {!demo && connected && realTotal === 0 && (
          <ConnectedEmptyNotice message="Your accounts are linked. Posts you schedule, draft, or publish will show up here." />
        )}

        <div className="mb-4">
          <Segmented options={options} value={tab} onChange={setTab} />
        </div>

        {rows.length > 0 ? (
          <Panel className="overflow-hidden">
            <ul>
              {rows.map((p) => {
                const open = expandedKey === p.key;
                return (
                  <li key={p.key} className="border-b border-divider last:border-b-0">
                    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                      {p.onClick ? (
                        <button
                          type="button"
                          onClick={p.onClick}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <PlatformGlyph p={p.platform} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-display text-[14px] text-text">{p.title}</div>
                            <div className="mt-0.5 text-[12.5px] text-faint">{p.meta}</div>
                          </div>
                        </button>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <PlatformGlyph p={p.platform} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-display text-[14px] text-text">{p.title}</div>
                            <div className="mt-0.5 text-[12.5px] text-faint">{p.meta}</div>
                          </div>
                        </div>
                      )}
                      {p.badge && <Badge tone={p.badge.tone}>{p.badge.label}</Badge>}
                      {p.posted && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(p.key)}
                          aria-expanded={open}
                          aria-label={open ? "Hide comments" : "View comments"}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-text"
                        >
                          <MessageCircle size={14} />
                          {p.engagement ? p.engagement.comments.length : null}
                          <ChevronDown
                            size={14}
                            className={`transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${p.title}`}
                        onClick={p.onDelete}
                        disabled={!demo && deletePost.isPending}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {p.posted && open && (
                      <PostEngagement
                        demo={demo}
                        likes={p.engagement?.likes}
                        comments={p.engagement?.comments}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<LayoutGrid size={22} />}
              title={demo ? "Nothing here yet" : "Your posts will live here"}
              description={EMPTY_COPY[tab]}
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
