import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, CalendarDays, BarChart3, ArrowRight } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { SOCIAL_TABS } from "../../lib/pageTabs";
import { Panel, PanelHeader, Badge, Button, EmptyState } from "../../components/ui";
import type { Tone } from "../../lib/status";
import { demoMode } from "../../demo/demoMode";
import {
  Platform,
  PlatformGlyph,
  NotConnectedNotice,
  ConnectedEmptyNotice,
  statusBadge,
  SOCIAL_CONTAINER,
} from "./shared";
import { useSocialAccounts, useSocialPosts } from "../../hooks/useSocial";
import {
  socialKpis,
  upNextPosts,
  recentPosts,
  postTitle,
  primaryPlatform,
  platformNames,
  formatDateTime,
  formatDate,
} from "../../lib/social";
import SocialComposerDialog from "../../components/social/SocialComposerDialog";

// The Social hub overview ("Glance"). Populated, designed layout in demo/preview;
// real, honest data (or an empty state) in a live session (see ./shared). No
// engagement endpoint exists, so the DMs KPI shows "-" in a real session.

const SAMPLE_KPIS: { label: string; value: string; brand?: boolean }[] = [
  { label: "Posts this month", value: "9" },
  { label: "DMs", value: "14", brand: true },
  { label: "Scheduled", value: "5" },
];

const UP_NEXT: {
  platform: Platform;
  title: string;
  meta: string;
  status: { tone: Tone; label: string };
}[] = [
  {
    platform: "ig",
    title: "Same-day hot water, Thompson job",
    meta: "Sat 6:00 PM · Instagram + Facebook",
    status: { tone: "brand", label: "Scheduled" },
  },
  {
    platform: "fb",
    title: "AC tune-up before the heat wave",
    meta: "Sun 9:00 AM · Facebook",
    status: { tone: "brand", label: "Scheduled" },
  },
  {
    platform: "gb",
    title: "Drain mistake every homeowner makes",
    meta: "Needs a photo before it can post",
    status: { tone: "warning", label: "Draft" },
  },
];

const RECENT: { platform: Platform; title: string; meta: string; metric: string; sub: string }[] = [
  { platform: "ig", title: "5★ review from the Garcias", meta: "Jun 14 · Instagram", metric: "4 calls", sub: "412 seen" },
  { platform: "fb", title: "Burst pipe save, before/after", meta: "Jun 9 · Facebook", metric: "3 calls", sub: "388 seen" },
];

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-[12px] font-medium text-brand-text hover:underline">
      {children} <ArrowRight size={12} />
    </Link>
  );
}

export default function SocialOverview() {
  const demo = demoMode();
  const accountsQ = useSocialAccounts(!demo);
  const postsQ = useSocialPosts({}, !demo);
  const [composerOpen, setComposerOpen] = useState(false);

  const realPosts = postsQ.data?.posts ?? [];
  const connected = accountsQ.data?.connected ?? false;

  const kpis = demo
    ? SAMPLE_KPIS
    : (() => {
        const k = socialKpis(realPosts, Date.now());
        // Only the two computable KPIs carry real numbers; DMs need an
        // engagement source the posting backend does not expose, so it reads "-".
        return [
          { label: "Posts this month", value: String(k.postsThisMonth) },
          { label: "DMs", value: "-", brand: true },
          { label: "Scheduled", value: String(k.scheduled) },
        ];
      })();

  const upNext = demo ? [] : upNextPosts(realPosts, 4);
  const recent = demo ? [] : recentPosts(realPosts, 4);

  return (
    <Shell>
      <SocialComposerDialog open={composerOpen} onClose={() => setComposerOpen(false)} />
      <div className={SOCIAL_CONTAINER}>
        <PageBar
          tabs={SOCIAL_TABS}
          actions={
            <Button variant="primary" size="md" onClick={() => setComposerOpen(true)}>
              <Plus size={16} /> New post
            </Button>
          }
        />

        {!demo && !connected && (
          <NotConnectedNotice message="These numbers are all 0 because nothing is linked. To see real posts and results, we still need to connect your social accounts (Facebook, Instagram, Google)." />
        )}
        {!demo && connected && realPosts.length === 0 && (
          <ConnectedEmptyNotice message="Your accounts are linked. Schedule your first post and it will appear here." />
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div
                className={`mt-2 font-data text-[28px] font-semibold tnum ${
                  k.brand ? "text-brand-text" : demo || k.value !== "0" ? "text-text" : "text-faint"
                }`}
              >
                {k.value}
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Up next"
              action={demo || upNext.length ? <SeeAll to="/marketing/social/calendar">Calendar</SeeAll> : undefined}
            />
            {demo ? (
              <ul>
                {UP_NEXT.map((p) => (
                  <li
                    key={p.title}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  >
                    <PlatformGlyph p={p.platform} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] text-text">{p.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-faint">{p.meta}</div>
                    </div>
                    <Badge tone={p.status.tone}>{p.status.label}</Badge>
                  </li>
                ))}
              </ul>
            ) : upNext.length ? (
              <ul>
                {upNext.map((p) => {
                  const badge = statusBadge(p.status);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                    >
                      <PlatformGlyph p={primaryPlatform(p)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[14px] text-text">{postTitle(p)}</div>
                        <div className="mt-0.5 text-[12.5px] text-faint">
                          {[formatDateTime(p.scheduleAt), platformNames(p.platforms)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<CalendarDays size={22} />}
                  title="Nothing scheduled yet"
                  description="Once your accounts are connected, your scheduled posts show up here."
                />
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Recently posted" />
            {demo ? (
              <ul>
                {RECENT.map((p) => (
                  <li
                    key={p.title}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  >
                    <PlatformGlyph p={p.platform} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] text-text">{p.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-faint">{p.meta}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-data text-[13px] font-semibold text-positive">{p.metric}</div>
                      <div className="text-[11px] text-faint">{p.sub}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : recent.length ? (
              <ul>
                {recent.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  >
                    <PlatformGlyph p={primaryPlatform(p)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] text-text">{postTitle(p)}</div>
                      <div className="mt-0.5 text-[12.5px] text-faint">
                        {[formatDate(p.publishedAt), platformNames(p.platforms)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<BarChart3 size={22} />}
                  title="No posts yet"
                  description="After your accounts are linked, published posts appear here."
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
