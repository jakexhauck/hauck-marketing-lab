import { BarChart3, TrendingUp } from "lucide-react";
import Shell from "../../components/Shell";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import PageBar from "../../components/PageBar";
import { REVIEWS_TABS } from "../../lib/pageTabs";
import { demoMode } from "../../demo/demoMode";
import { StarRating, NotConnectedNotice, REVIEWS_CONTAINER } from "./shared";

// The Google Reviews "What's working" surface (Phase 2: no live insights backend
// yet). Same golden rule as the rest of Reviews and Social: a real, connected
// client must never see fabricated numbers. The designed, populated layout
// (rating trend, conversion stats, source bars) renders only in demo/preview
// mode. In a real session everything is empty and a NotConnectedNotice plus an
// EmptyState explain that trends appear once Google is connected and reviews
// come in.

// --- Sample data (demo only) ---------------------------------------------

const AVG_RATING = 4.8;

// Top stat cards. brand = the headline figure gets the indigo treatment.
const STATS: { label: string; value: string; detail: string; brand?: boolean }[] = [
  { label: "Average rating", value: "4.8", detail: "Steady over 6 months", brand: true },
  { label: "Ask to review", value: "38%", detail: "Of asks become reviews" },
  { label: "Reply rate", value: "92%", detail: "Of reviews replied to" },
  { label: "New this month", value: "6", detail: "All five stars" },
];
const EMPTY_STATS = STATS.map((s) => ({ ...s, value: "0", detail: "Nothing to show yet", brand: false }));

// Monthly average rating over the last 6 months. A gentle, observed climb, not a
// promise. Drawn as an SVG area + line below.
const TREND: { month: string; rating: number }[] = [
  { month: "Jan", rating: 4.6 },
  { month: "Feb", rating: 4.7 },
  { month: "Mar", rating: 4.7 },
  { month: "Apr", rating: 4.8 },
  { month: "May", rating: 4.8 },
  { month: "Jun", rating: 4.8 },
];

// Where reviews start (last 90 days). Horizontal bars, brand fill.
const SOURCES: { label: string; pct: number }[] = [
  { label: "After a job text", pct: 62 },
  { label: "Email ask", pct: 24 },
  { label: "Walk-in", pct: 9 },
  { label: "Website", pct: 5 },
];

// This month, as plain observed counts.
const GLANCE: { label: string; value: string; sub?: string; top?: boolean }[] = [
  { label: "Asks sent", value: "16", top: true },
  { label: "Reviews collected", value: "6", sub: "of 16" },
  { label: "Replies posted", value: "6", sub: "of 6" },
  { label: "Shared to social", value: "3" },
  { label: "Median time to review", value: "1.4", sub: "days" },
];

// --- Chart geometry -------------------------------------------------------

// viewBox space. The rating scale is intentionally tight (4.3 to 5.0) so a
// gentle climb reads clearly without exaggerating it.
const VB_W = 600;
const VB_H = 200;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;
const SCALE_MIN = 4.3;
const SCALE_MAX = 5.0;

function pointFor(rating: number, index: number, count: number) {
  const x = count === 1 ? 0 : (index / (count - 1)) * VB_W;
  const t = (SCALE_MAX - rating) / (SCALE_MAX - SCALE_MIN);
  const y = PAD_TOP + t * (VB_H - PAD_TOP - PAD_BOTTOM);
  return { x, y };
}

const POINTS = TREND.map((d, i) => pointFor(d.rating, i, TREND.length));
const LINE_PATH = POINTS.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
const AREA_PATH = `${LINE_PATH} L${VB_W} ${VB_H} L0 ${VB_H} Z`;
const LAST = POINTS[POINTS.length - 1];

// --- Component ------------------------------------------------------------

export default function ReviewsInsights() {
  const demo = demoMode();
  const stats = demo ? STATS : EMPTY_STATS;

  return (
    <Shell>
      <div className={REVIEWS_CONTAINER}>
        <PageBar
          tabs={REVIEWS_TABS}
          description="The few numbers behind your rating. No vanity metrics, just what to keep doing."
        />

        {!demo && (
          <NotConnectedNotice message="No data yet. Your review trends appear here once your Google Business Profile is connected and reviews start coming in." />
        )}

        {demo && (
          <Panel className="mb-4 border-brand/30 bg-brand-tint p-5">
            <div className="label-cap text-brand-text">The short version</div>
            <p className="mt-2 max-w-[780px] text-[15px] leading-relaxed text-text">
              Most of your reviews start with a{" "}
              <span className="font-semibold text-brand-text">text right after the job wraps</span>. You picked up{" "}
              <span className="font-semibold">6 new reviews</span> this month and replied to nearly all of them. Keep
              the asks going the same day and your rating holds.
            </p>
          </Panel>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <Panel key={s.label} className="p-4">
              <div className="text-[13px] text-muted">{s.label}</div>
              <div
                className={`mt-2 stat-num text-[26px] ${
                  s.brand ? "text-brand-text" : demo ? "text-text" : "text-faint"
                }`}
              >
                {s.value}
              </div>
              {s.brand && demo && <StarRating value={AVG_RATING} size={13} className="mt-2" />}
              <div className="mt-1.5 text-[11.5px] text-faint">{s.detail}</div>
            </Panel>
          ))}
        </div>

        {demo ? (
          <>
            {/* Rating trend */}
            <Panel className="mt-4 p-5">
              <div className="flex items-center gap-2">
                <h4 className="font-display text-[14px] text-text">Rating trend</h4>
                <span className="text-[12px] text-faint">Monthly average, last 6 months</span>
                <Badge tone="positive" className="ml-auto">
                  <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
                  Holding strong
                </Badge>
              </div>

              <div className="mt-4 flex gap-3">
                {/* Y axis */}
                <div className="flex h-[170px] flex-col justify-between pb-5 text-[10px] tnum text-faint">
                  <span>5.0</span>
                  <span>4.6</span>
                  <span>4.3</span>
                </div>

                <div className="min-w-0 flex-1">
                  <svg
                    viewBox={`0 0 ${VB_W} ${VB_H}`}
                    preserveAspectRatio="none"
                    className="block h-[150px] w-full"
                    role="img"
                    aria-label="Rating trend over the last 6 months, holding around 4.8"
                  >
                    <defs>
                      <linearGradient id="reviewsTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-2)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--brand-2)" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="reviewsTrendLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--brand)" />
                        <stop offset="100%" stopColor="var(--brand-2)" />
                      </linearGradient>
                    </defs>

                    {/* Gridlines */}
                    <line x1="0" y1={PAD_TOP} x2={VB_W} y2={PAD_TOP} stroke="var(--divider)" strokeWidth="1" />
                    <line
                      x1="0"
                      y1={(VB_H - PAD_BOTTOM + PAD_TOP) / 2}
                      x2={VB_W}
                      y2={(VB_H - PAD_BOTTOM + PAD_TOP) / 2}
                      stroke="var(--divider)"
                      strokeWidth="1"
                    />
                    <line
                      x1="0"
                      y1={VB_H - PAD_BOTTOM}
                      x2={VB_W}
                      y2={VB_H - PAD_BOTTOM}
                      stroke="var(--divider)"
                      strokeWidth="1"
                    />

                    <path d={AREA_PATH} fill="url(#reviewsTrendFill)" />
                    <path
                      d={LINE_PATH}
                      fill="none"
                      stroke="url(#reviewsTrendLine)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {POINTS.slice(0, -1).map((p) => (
                      <circle key={p.x} cx={p.x} cy={p.y} r="4" fill="var(--brand)" />
                    ))}
                    <circle cx={LAST.x} cy={LAST.y} r="5.5" fill="var(--brand-2)" stroke="var(--surface)" strokeWidth="2.5" />
                  </svg>

                  {/* X labels */}
                  <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
                    {TREND.map((d) => (
                      <span key={d.month}>{d.month}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Where reviews start */}
              <Panel className="p-5">
                <div className="mb-1 flex items-center gap-2">
                  <h4 className="font-display text-[14px] text-text">Where reviews start</h4>
                  <span className="text-[12px] text-faint">Last 90 days</span>
                </div>
                <div className="mt-2 flex flex-col gap-3.5">
                  {SOURCES.map((s) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-text">{s.label}</span>
                        <span className="font-data text-[12.5px] font-semibold tnum text-brand-text">{s.pct}%</span>
                      </div>
                      <div className="mt-2 h-[9px] overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.pct}%`, background: "var(--grad-brand)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* This month at a glance */}
              <Panel className="overflow-hidden">
                <PanelHeader title="This month at a glance" />
                <ul>
                  {GLANCE.map((g, i) => (
                    <li
                      key={g.label}
                      className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                    >
                      <span
                        className={`font-display text-[15px] tnum ${g.top ? "text-brand-text" : "text-faint"}`}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 text-[13.5px] font-medium text-text">{g.label}</span>
                      <span className="font-data text-[13px] font-semibold tnum text-text">
                        {g.value}
                        {g.sub && <span className="ml-1 font-normal text-faint">{g.sub}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              {/* Plain-English takeaway */}
              <Panel className="flex items-center gap-3 border-positive/30 bg-positive-tint p-4 lg:col-span-2">
                <TrendingUp size={20} className="shrink-0 text-positive" />
                <div className="flex-1 text-[13px] leading-snug text-text">
                  The same-day text is doing the heavy lifting.{" "}
                  <span className="font-semibold text-positive">Keep asking right after each job wraps.</span>
                </div>
                <Badge tone="positive">Working</Badge>
              </Panel>
            </div>
          </>
        ) : (
          <Panel className="mt-4 px-4 py-12">
            <EmptyState
              icon={<BarChart3 size={22} />}
              title="No data yet"
              description="Your review trends appear here once your Google profile is connected and reviews come in: your rating over time, how many asks become reviews, and where they start."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
