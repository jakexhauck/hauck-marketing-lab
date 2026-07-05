import { BarChart3, Zap } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { SOCIAL_TABS } from "../../lib/pageTabs";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { Platform, PlatformGlyph, NotConnectedNotice, SOCIAL_CONTAINER } from "./shared";

// Plain-English performance. Populated in demo; zeroed + empty otherwise.

const STATS: { label: string; value: string; brand?: boolean }[] = [
  { label: "Posts published", value: "9" },
  { label: "DMs", value: "14", brand: true },
  { label: "Your best time", value: "Sat 6PM" },
];
const EMPTY_STATS = STATS.map((s) => ({ ...s, value: "0", brand: false }));

const BARS: { label: string; pct: number; win?: boolean }[] = [
  { label: "Job photos", pct: 90, win: true },
  { label: "Reviews", pct: 62, win: true },
  { label: "Offers", pct: 38 },
  { label: "Tips", pct: 22 },
  { label: "Other", pct: 14 },
];

const TOP: { platform: Platform; title: string; meta: string; metric: string; sub: string }[] = [
  { platform: "ig", title: "5★ review from the Garcias", meta: "Jun 14 · Instagram", metric: "4 calls", sub: "412 seen" },
  { platform: "fb", title: "Burst pipe save, before/after", meta: "Jun 9 · Facebook", metric: "3 calls", sub: "388 seen" },
  { platform: "ig", title: "Water heater swap", meta: "Jun 2 · Instagram", metric: "2 calls", sub: "301 seen" },
];

export default function SocialInsights() {
  const demo = demoMode();
  const stats = demo ? STATS : EMPTY_STATS;

  return (
    <Shell>
      <div className={SOCIAL_CONTAINER}>
        <PageBar tabs={SOCIAL_TABS} description="Last 30 days." />

        {!demo && (
          <NotConnectedNotice message="There are no results to show yet. Connect your social accounts and your performance will appear here in plain English." />
        )}

        {demo && (
          <Panel className="mb-4 border-brand/30 bg-brand-tint p-5">
            <div className="label-cap text-brand-text">The short version</div>
            <p className="mt-2 max-w-[780px] text-[15px] leading-relaxed text-text">
              Your <span className="font-semibold text-brand-text">before/after job posts</span> get the most calls.
              You posted <span className="font-semibold">9 times</span> this month and people reached out{" "}
              <span className="font-semibold">14 times</span>. Keep posting one job photo a week — that's your winner.
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
                  s.brand ? "text-brand-text" : demo ? "text-text" : "text-faint"
                }`}
              >
                {s.value}
              </div>
            </Panel>
          ))}
        </div>

        {demo ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <h4 className="mb-4 font-display text-[14px] text-text">Calls by post type</h4>
              <div className="flex h-[150px] items-end gap-3.5">
                {BARS.map((b) => (
                  <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div
                      className="w-full rounded-t-[7px]"
                      style={{
                        height: `${b.pct}%`,
                        background: b.win ? "var(--grad-brand)" : "var(--surface-2)",
                      }}
                    />
                    <span className="text-center text-[10.5px] text-faint">{b.label}</span>
                  </div>
                ))}
              </div>
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
                    <div className="shrink-0 text-right">
                      <div className="font-data text-[13px] font-semibold text-positive">{p.metric}</div>
                      <div className="text-[11px] text-faint">{p.sub}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className="flex items-center gap-3 border-warning/30 bg-warning-tint p-4 lg:col-span-2">
              <Zap size={20} className="shrink-0 text-warning" />
              <div className="flex-1 text-[13px] leading-snug text-text">
                Your "hot water" post is getting traction on its own.{" "}
                <span className="font-semibold text-warning">Want us to boost it as an ad?</span>
              </div>
              <Badge tone="warning">Idea</Badge>
            </Panel>
          </div>
        ) : (
          <Panel className="mt-4 px-4 py-12">
            <EmptyState
              icon={<BarChart3 size={22} />}
              title="Your results, in plain English"
              description="Once connected, you'll see which posts drive calls and messages, your best time to post, and your top posts — without the vanity metrics."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
