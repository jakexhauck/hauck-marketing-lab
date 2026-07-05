import { BarChart3, Heart, MessageCircle } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { SOCIAL_TABS } from "../../lib/pageTabs";
import { Panel, PanelHeader, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  Platform,
  PlatformGlyph,
  NotConnectedNotice,
  ConnectedEmptyNotice,
  SOCIAL_CONTAINER,
} from "./shared";
import { useSocialAccounts, useSocialPosts } from "../../hooks/useSocial";

// The Social "Insights" page (formerly "What's working"). Plain-English
// performance: posts published, DMs, best time, and per-platform engagement.
//
// ENGAGEMENT DATA SOURCE FLAG
// The posting backend exposes NO reach / likes / comments / DMs data. Real
// per-post and per-platform engagement needs read access to Meta Graph
// (Facebook + Instagram) and Google Business Profile, wired per tenant with the
// account's own tokens (the app does not hold these yet). Until that source is
// live, a real session shows only what we can honestly compute from posts
// (posts published) plus a "connecting your accounts" note, and never fabricates
// engagement. `?demo=1` still shows the full designed layout.
//
// TODO(engagement): build functions/api/social/engagement.ts against Meta Graph
// + Google Business, add a useSocialEngagement hook, then flip this to true and
// read the real numbers below. Jake must confirm the source per tenant.
const ENGAGEMENT_SOURCE_READY = false;

const STATS: { label: string; value: string; brand?: boolean }[] = [
  { label: "Posts published", value: "9" },
  { label: "DMs", value: "14", brand: true },
  { label: "Your best time", value: "Sat 6PM" },
];

// Per-platform engagement (likes + comments). Demo only until the source is wired.
const PLATFORM_ENGAGEMENT: { platform: Platform; name: string; likes: number; comments: number }[] = [
  { platform: "fb", name: "Facebook", likes: 182, comments: 24 },
  { platform: "ig", name: "Instagram", likes: 241, comments: 31 },
  { platform: "gb", name: "Google", likes: 46, comments: 9 },
];

const TOP: { platform: Platform; title: string; meta: string; likes: number; comments: number }[] = [
  { platform: "ig", title: "5★ review from the Garcias", meta: "Jun 14 · Instagram", likes: 96, comments: 12 },
  { platform: "fb", title: "Burst pipe save, before/after", meta: "Jun 9 · Facebook", likes: 74, comments: 8 },
  { platform: "ig", title: "Water heater swap", meta: "Jun 2 · Instagram", likes: 61, comments: 5 },
];

export default function SocialInsights() {
  const demo = demoMode();
  const accountsQ = useSocialAccounts(!demo);
  const postsQ = useSocialPosts({}, !demo);

  const connected = accountsQ.data?.connected ?? false;
  const realPosts = postsQ.data?.posts ?? [];
  const postsPublished = realPosts.filter((p) => p.status === "posted").length;

  // Real stat cards: only "Posts published" is computable from the posting
  // backend. DMs + best time need the engagement source, so they read "-" until
  // ENGAGEMENT_SOURCE_READY.
  const realStats: { label: string; value: string; brand?: boolean }[] = [
    { label: "Posts published", value: String(postsPublished) },
    { label: "DMs", value: "-", brand: true },
    { label: "Your best time", value: "-" },
  ];

  const stats = demo ? STATS : realStats;

  return (
    <Shell>
      <div className={SOCIAL_CONTAINER}>
        <PageBar tabs={SOCIAL_TABS} description="Last 30 days." />

        {!demo && !connected && (
          <NotConnectedNotice message="There are no results to show yet. Connect your social accounts and your performance will appear here in plain English." />
        )}
        {!demo && connected && !ENGAGEMENT_SOURCE_READY && (
          <ConnectedEmptyNotice message="Your accounts are linked. We're setting up the connection that pulls your likes, comments, and DMs. Your engagement will show up here soon." />
        )}

        {demo && (
          <Panel className="mb-4 border-brand/30 bg-brand-tint p-5">
            <div className="label-cap text-brand-text">The short version</div>
            <p className="mt-2 max-w-[780px] text-[15px] leading-relaxed text-text">
              Your <span className="font-semibold text-brand-text">before/after job posts</span> get the most
              engagement. You posted <span className="font-semibold">9 times</span> this month and got{" "}
              <span className="font-semibold">14 DMs</span>. Keep posting one job photo a week, that's your winner.
            </p>
          </Panel>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <Panel key={s.label} className="p-4">
              <div className="text-[13px] text-muted">{s.label}</div>
              <div
                className={`mt-2 font-data text-[26px] font-semibold tnum ${
                  s.brand ? "text-brand-text" : demo || s.value !== "0" ? "text-text" : "text-faint"
                }`}
              >
                {s.value}
              </div>
            </Panel>
          ))}
        </div>

        {demo ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="overflow-hidden">
              <PanelHeader title="Engagement by platform" />
              <ul>
                {PLATFORM_ENGAGEMENT.map((row) => (
                  <li
                    key={row.platform}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  >
                    <PlatformGlyph p={row.platform} size={30} />
                    <div className="min-w-0 flex-1 font-display text-[13.5px] text-text">{row.name}</div>
                    <div className="flex items-center gap-4 text-[12.5px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <Heart size={14} className="text-faint" /> {row.likes}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageCircle size={14} className="text-faint" /> {row.comments}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className="overflow-hidden">
              <PanelHeader title="Top posts" />
              <ul>
                {TOP.map((p) => (
                  <li
                    key={p.title}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  >
                    <PlatformGlyph p={p.platform} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[13.5px] text-text">{p.title}</div>
                      <div className="mt-0.5 text-[11.5px] text-faint">{p.meta}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[12px] text-muted">
                      <span className="flex items-center gap-1">
                        <Heart size={13} className="text-faint" /> {p.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={13} className="text-faint" /> {p.comments}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        ) : (
          <Panel className="mt-4 px-4 py-12">
            <EmptyState
              icon={<BarChart3 size={22} />}
              title="Your results, in plain English"
              description="Once your accounts are linked for insights, you'll see which posts drive the most likes, comments, and DMs, your best time to post, and your top posts, without the vanity metrics."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
