import { useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Badge, Button, EmptyState, Segmented } from "../../components/ui";
import type { Tone } from "../../lib/status";
import { demoMode } from "../../demo/demoMode";
import { Platform, PlatformGlyph, NotConnectedNotice, SOCIAL_CONTAINER } from "./shared";

// The client's own pipeline of posts. Demo shows sample posts per status; a real
// session shows an empty state per tab plus the not-connected notice.

type Status = "scheduled" | "drafts" | "posted";
type Post = {
  platform: Platform;
  title: string;
  meta: string;
  badge?: { tone: Tone; label: string };
  metric?: { value: string; sub: string };
};

const POSTS: Record<Status, Post[]> = {
  scheduled: [
    {
      platform: "ig",
      title: "Same-day hot water — Thompson job",
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
      meta: "Draft · in your voice",
      badge: { tone: "warning", label: "Needs a photo" },
    },
  ],
  posted: [
    {
      platform: "ig",
      title: "5★ review from the Garcias",
      meta: "Jun 14 · Instagram",
      metric: { value: "4 calls", sub: "412 seen" },
    },
    {
      platform: "fb",
      title: "Burst pipe save, before/after",
      meta: "Jun 9 · Facebook",
      metric: { value: "3 calls", sub: "388 seen" },
    },
    {
      platform: "ig",
      title: "Water heater swap",
      meta: "Jun 2 · Instagram",
      metric: { value: "2 calls", sub: "301 seen" },
    },
  ],
};

const EMPTY_COPY: Record<Status, string> = {
  scheduled: "Posts you schedule will line up here, ready to publish.",
  drafts: "Drafts you start (or generate from an idea) wait here until you post them.",
  posted: "Published posts and how they performed will appear here.",
};

export default function SocialPosts() {
  const demo = demoMode();
  const [tab, setTab] = useState<Status>("scheduled");

  const options = [
    { value: "scheduled" as const, label: "Scheduled", count: demo ? POSTS.scheduled.length : 0 },
    { value: "drafts" as const, label: "Drafts", count: demo ? POSTS.drafts.length : 0 },
    { value: "posted" as const, label: "Posted", count: demo ? POSTS.posted.length : 0 },
  ];
  const rows = demo ? POSTS[tab] : [];

  return (
    <Shell>
      <div className={SOCIAL_CONTAINER}>
        <PageHeader
          title="My Posts"
          description="Everything you've scheduled, drafted, and published."
          actions={
            <Button variant="primary" size="md" disabled={!demo}>
              <Plus size={16} /> New Post
            </Button>
          }
        />

        {!demo && (
          <NotConnectedNotice message="Your posts live here once you can publish. Connect your social accounts through GoHighLevel to get started." />
        )}

        <div className="mb-4">
          <Segmented options={options} value={tab} onChange={setTab} />
        </div>

        {rows.length > 0 ? (
          <Panel className="overflow-hidden">
            <ul>
              {rows.map((p) => (
                <li
                  key={p.title}
                  className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                >
                  <PlatformGlyph p={p.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[14px] text-text">{p.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-faint">{p.meta}</div>
                  </div>
                  {p.badge && <Badge tone={p.badge.tone}>{p.badge.label}</Badge>}
                  {p.metric && (
                    <div className="shrink-0 text-right">
                      <div className="font-data text-[13px] font-semibold text-positive">{p.metric.value}</div>
                      <div className="text-[11px] text-faint">{p.metric.sub}</div>
                    </div>
                  )}
                </li>
              ))}
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
