import { Plus, Reply, Wrench, ArrowRight, MessageSquare, Quote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import { Panel, PanelHeader, Button, EmptyState } from "../../components/ui";
import PageBar from "../../components/PageBar";
import { REVIEWS_TABS } from "../../lib/pageTabs";
import { demoMode } from "../../demo/demoMode";
import { StarRating, ReviewsComingSoon, REVIEWS_CONTAINER } from "./shared";

// The Google Reviews hub overview. Same golden rule as Social: a real (connected)
// client must never see fabricated reviews. The designed, populated layout renders
// only in demo/preview mode; a real session shows zeroed stats, the
// <NotConnectedNotice/> banner, and <EmptyState/> placeholders in the panels.

const ASK_REQUESTS = "/marketing/reviews/requests";
const ALL_REVIEWS = "/marketing/reviews/all";

// Headline reputation numbers (demo only). Sample local plumbing / HVAC client.
const SAMPLE = {
  average: 4.8,
  total: 132,
};

// The 2x2 stat chips beside the big rating (demo only).
const SAMPLE_STATS: { label: string; value: string; detail: string; positive?: boolean }[] = [
  { label: "Total reviews", value: "132", detail: "All time on Google" },
  { label: "New this month", value: "6", detail: "All 5 stars", positive: true },
  { label: "Requests sent", value: "11", detail: "This month" },
  { label: "Reply rate", value: "96%", detail: "You answer almost all" },
];

const EMPTY_STATS = SAMPLE_STATS.map((s) => ({
  ...s,
  value: s.value.endsWith("%") ? "0%" : "0",
  positive: false,
}));

// Recently completed jobs with no review yet (demo only).
const READY_TO_ASK: { name: string; detail: string }[] = [
  { name: "Thompson water heater", detail: "Same-day swap, finished 2 hrs ago" },
  { name: "Reyes AC tune-up", detail: "Seasonal service, finished yesterday" },
  { name: "Okafor drain clearing", detail: "Kitchen line, finished 2 days ago" },
];

// Latest reviews pulled from Google (demo only). All five stars.
const RECENT_REVIEWS: { who: string; when: string; body: string }[] = [
  {
    who: "The Garcias",
    when: "2 days ago",
    body: "Woke up to no hot water and they had a new heater in by lunch. Tidy, fair price, walked us through everything.",
  },
  {
    who: "Mark T.",
    when: "4 days ago",
    body: "AC tune-up before the heat hit. Honest about what needed doing and what could wait. No upsell games.",
  },
  {
    who: "Janet R.",
    when: "1 week ago",
    body: "Burst pipe under the sink at 9pm. They came out, stopped the flood, and saved the cabinets. Lifesavers.",
  },
];

export default function ReviewsOverview() {
  const demo = demoMode();
  const navigate = useNavigate();
  const stats = demo ? SAMPLE_STATS : EMPTY_STATS;

  return (
    <Shell>
      <div className={REVIEWS_CONTAINER}>
        <PageBar
          tabs={REVIEWS_TABS}
          description="Your reputation at a glance. Ask for new ones and reply to the rest."
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                className="hidden sm:inline-flex"
                onClick={() => navigate(ALL_REVIEWS)}
              >
                <Reply size={16} /> Reply to reviews
              </Button>
              <Button variant="primary" size="md" onClick={() => navigate(ASK_REQUESTS)}>
                <Plus size={16} /> Ask for a review
              </Button>
            </>
          }
        />

        {!demo ? (
          <ReviewsComingSoon />
        ) : (
          <>
        {/* Hero: huge gradient average + stars on the left, stat chips on the right. */}
        <Panel className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 shadow-[var(--shadow-md)] sm:p-9">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(34rem 20rem at 6% -30%, var(--brand-tint), transparent 60%), radial-gradient(28rem 18rem at 108% 130%, var(--brand-tint), transparent 60%)",
            }}
          />
          <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="label-cap text-brand-text">Your reputation</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                  Google Business Profile
                </span>
              </div>

              <div className="mt-3.5 flex items-start gap-4 sm:gap-5">
                <div
                  className={`hero-num tnum text-[78px] leading-none sm:text-[104px] ${
                    demo ? "grad-text" : "text-faint"
                  }`}
                >
                  {demo ? SAMPLE.average.toFixed(1) : "0.0"}
                </div>
                <div className="pt-2 sm:pt-3">
                  <StarRating value={demo ? SAMPLE.average : 0} size={20} className="mb-2" />
                  <div className="text-[13px] font-medium text-faint">
                    Across <b className="font-semibold text-text tnum">{demo ? SAMPLE.total : 0}</b>{" "}
                    reviews
                  </div>
                </div>
              </div>

              {demo ? (
                <p className="mt-4 max-w-[400px] text-[14.5px] leading-snug text-muted">
                  Steady and strong. You picked up{" "}
                  <b className="font-semibold text-text">6 new reviews</b> this month, and every one
                  is five stars. Keep the asks going right after each job wraps.
                </p>
              ) : (
                <p className="mt-4 max-w-[400px] text-[14.5px] leading-snug text-muted">
                  Once your Google profile is linked, your real rating and review count show up here.
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button variant="primary" size="md" onClick={() => navigate(ASK_REQUESTS)}>
                  <Plus size={16} /> Ask for a review
                </Button>
                <Button variant="secondary" size="md" onClick={() => navigate(ALL_REVIEWS)}>
                  See all reviews
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]"
                >
                  <div className="label-cap">{s.label}</div>
                  <div
                    className={`stat-num mt-1.5 text-[30px] tnum ${demo ? "text-text" : "text-faint"}`}
                  >
                    {s.value}
                  </div>
                  <div
                    className={`mt-1 text-[11.5px] font-medium ${
                      s.positive ? "text-positive" : "text-faint"
                    }`}
                  >
                    {s.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Two panels: ready-to-ask jobs and recent reviews as quote cards. */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Ready to ask"
              action={
                demo ? (
                  <button
                    onClick={() => navigate(ASK_REQUESTS)}
                    className="flex items-center gap-1 text-[12px] font-medium text-brand-text hover:underline"
                  >
                    Open <ArrowRight size={12} />
                  </button>
                ) : undefined
              }
            />
            {demo ? (
              <ul className="p-2">
                {READY_TO_ASK.map((job) => (
                  <li
                    key={job.name}
                    className="flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand-tint text-brand-text">
                      <Wrench size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-text">{job.name}</div>
                      <div className="mt-0.5 truncate text-[12px] text-faint">{job.detail}</div>
                    </div>
                    <Button variant="subtle" size="sm" onClick={() => navigate(ASK_REQUESTS)}>
                      Ask
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<Wrench size={22} />}
                  title="No jobs to ask about yet"
                  description="Once you're connected, recently finished jobs with no review yet appear here, ready for a one-tap ask."
                />
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Recent reviews"
              action={
                demo ? (
                  <button
                    onClick={() => navigate(ALL_REVIEWS)}
                    className="flex items-center gap-1 text-[12px] font-medium text-brand-text hover:underline"
                  >
                    View all <ArrowRight size={12} />
                  </button>
                ) : undefined
              }
            />
            {demo ? (
              <div className="p-3">
                {RECENT_REVIEWS.map((r) => (
                  <div
                    key={r.who}
                    className="border-b border-divider px-2 py-3 last:border-b-0"
                  >
                    <Quote size={16} className="mb-1.5 text-brand-text" />
                    <p className="text-[13px] leading-relaxed text-text">{r.body}</p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-text">{r.who}</span>
                      <StarRating value={5} size={12} />
                      <span className="ml-auto text-[11.5px] text-faint">{r.when}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<MessageSquare size={22} />}
                  title="No reviews yet"
                  description="After your Google Business Profile is linked, your latest reviews show up here."
                />
              </div>
            )}
          </Panel>
        </div>
        </>
        )}
      </div>
    </Shell>
  );
}
