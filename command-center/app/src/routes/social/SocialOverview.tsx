import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus, CalendarDays, Sparkles, BarChart3, Zap, ArrowRight } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader, Badge, Button, EmptyState } from "../../components/ui";
import type { Tone } from "../../lib/status";
import { demoMode } from "../../demo/demoMode";
import { Platform, PlatformGlyph, NotConnectedNotice, SOCIAL_CONTAINER } from "./shared";
import SocialComposerDialog from "../../components/social/SocialComposerDialog";
import PlanMonthDialog from "../../components/social/PlanMonthDialog";

// The Social hub overview ("Glance"). Populated, designed layout in demo/preview;
// zeroed + not-connected state for a real session (see ./shared).

const SAMPLE_KPIS: { label: string; value: string; brand?: boolean }[] = [
  { label: "Posts this month", value: "9" },
  { label: "Calls & messages", value: "14", brand: true },
  { label: "People reached", value: "2,100" },
  { label: "Scheduled", value: "5" },
];

const EMPTY_KPIS = SAMPLE_KPIS.map((k) => ({ ...k, value: "0", brand: false }));

const UP_NEXT: {
  platform: Platform;
  title: string;
  meta: string;
  status: { tone: Tone; label: string };
}[] = [
  {
    platform: "ig",
    title: "Same-day hot water — Thompson job",
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

const IDEAS: { kind: string; title: string; platforms: Platform[] }[] = [
  { kind: "Social proof", title: "Show off the Thompson water-heater job", platforms: ["ig", "fb"] },
  { kind: "Seasonal", title: "AC tune-up reminder for the heat wave", platforms: ["fb"] },
  { kind: "Review", title: "Turn the Garcia 5★ into a post", platforms: ["ig"] },
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
  const kpis = demo ? SAMPLE_KPIS : EMPTY_KPIS;
  const [dialog, setDialog] = useState<null | "composer" | "plan">(null);

  return (
    <Shell>
      <SocialComposerDialog open={dialog === "composer"} onClose={() => setDialog(null)} />
      <PlanMonthDialog open={dialog === "plan"} onClose={() => setDialog(null)} />
      <div className={SOCIAL_CONTAINER}>
        <PageHeader
          title="Social Media"
          description="Your social at a glance. Here's what's next and what's working."
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                className="hidden sm:inline-flex"
                onClick={() => setDialog("plan")}
              >
                <CalendarDays size={16} /> Plan my month
              </Button>
              <Button variant="primary" size="md" onClick={() => setDialog("composer")}>
                <Plus size={16} /> New post
              </Button>
            </>
          }
        />

        {!demo && <NotConnectedNotice message="These numbers are all 0 because nothing is linked. To see real posts and results, we still need to connect your social accounts (Facebook, Instagram, Google) through GoHighLevel." />}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div
                className={`mt-2 font-data text-[28px] font-semibold tnum ${
                  k.brand ? "text-brand-text" : demo ? "text-text" : "text-faint"
                }`}
              >
                {k.value}
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Panel className="overflow-hidden">
              <PanelHeader
                title="Up next"
                action={demo ? <SeeAll to="/marketing/social/calendar">Calendar</SeeAll> : undefined}
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
              <PanelHeader
                title="Recently posted"
                action={demo ? <SeeAll to="/marketing/social/insights">What's working</SeeAll> : undefined}
              />
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
              ) : (
                <div className="px-4 py-10">
                  <EmptyState
                    icon={<BarChart3 size={22} />}
                    title="No posts yet"
                    description="After your accounts are linked, published posts and how they performed appear here."
                  />
                </div>
              )}
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden">
              <PanelHeader
                title="Ideas for you"
                action={<SeeAll to="/marketing/social/ideas">See all</SeeAll>}
              />
              {demo ? (
                <div className="flex flex-col gap-2.5 p-3">
                  {IDEAS.map((idea) => (
                    <Link
                      key={idea.title}
                      to="/marketing/social/ideas"
                      className="group relative overflow-hidden rounded-[12px] border border-border bg-surface px-3.5 py-3 pl-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]"
                    >
                      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundImage: "var(--grad-brand)" }} />
                      <div className="label-cap text-brand-text">{idea.kind}</div>
                      <div className="mt-1.5 text-[13.5px] font-semibold leading-snug text-text">{idea.title}</div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="flex gap-1">
                          {idea.platforms.map((p) => (
                            <PlatformGlyph key={p} p={p} size={19} />
                          ))}
                        </div>
                        <span className="flex items-center gap-1 text-[12.5px] font-medium text-brand-text">
                          Write it <ArrowRight size={12} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10">
                  <EmptyState
                    icon={<Sparkles size={22} />}
                    title="Ideas are on the way"
                    description="Post ideas built from your jobs and the week ahead appear once you're connected."
                  />
                </div>
              )}
            </Panel>

            {demo && (
              <Panel className="flex items-center gap-3 border-warning/30 bg-warning-tint p-4">
                <Zap size={20} className="shrink-0 text-warning" />
                <div className="flex-1 text-[13px] leading-snug text-text">
                  Your "hot water" post is taking off.{" "}
                  <span className="font-semibold text-warning">Boost it as an ad?</span>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
