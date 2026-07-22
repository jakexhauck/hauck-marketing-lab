import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Shell from "../components/Shell";
import HomeDesktop from "../components/home/HomeDesktop";
import NavyHero from "../components/NavyHero";
import SplitHero, { HeroMark, HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import EmptyState from "../components/EmptyState";
import NotificationPrompt from "../components/NotificationPrompt";
import CloseOutBanner from "../components/home/CloseOutBanner";
import NotificationBell from "../components/NotificationBell";
import { Skeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import PullToRefresh from "../components/PullToRefresh";
import {
  useActivityQuery,
  useReviewsQuery,
  useSummaryQuery,
} from "../hooks/useApi";
import { useJobs } from "../hooks/useJobs";
import { demoMode } from "../demo/demoMode";
import { APP_BRAND } from "../lib/appBrand";
import { activityLabel } from "../lib/activityLabels";
import { freshnessLabel } from "../lib/freshness";
import { DEMO_DEFAULT_DAY, jobsOnDay, toIso } from "../lib/jobsPipeline";
import type { ApiActivity } from "../lib/api";

function activityTitle(a: ApiActivity): string {
  return a.payload?.summary ?? activityLabel(a.action);
}

function activityWhen(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = now - then;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// One tappable row in the "Today" priority feed: coloured left stripe, tinted
// icon chip, title + one-line subtitle, and a big right-aligned count.
interface PriorityCard {
  key: string;
  title: string;
  subtitle: string;
  count: number;
  to: string;
  Icon: LucideIcon;
  // Tailwind classes carry the accent so both the light and dark themes stay
  // in step. Brand rows lean on the app's --brand-* tokens; sample rows use
  // amber/emerald.
  stripe: string;
  chip: string;
  countColor: string;
}

// The Home screen shares these query keys with pull-to-refresh; tapping the
// freshness line and overscrolling both invalidate the same set.
const REFRESH_KEYS: unknown[][] = [["summary"], ["activity"], ["notifications"]];

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, mode } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useSummaryQuery(useReal);
  const activityQuery = useActivityQuery(useReal);
  const jobs = useJobs();
  const reviewsQuery = useReviewsQuery(useReal);

  const summary = query.data;
  const activity = activityQuery.data?.activity ?? [];
  const isTest = mode === "test";
  const isDemo = demoMode();
  const today = new Date(now).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Real last-success time from the cache, not a fabricated Date.now().
  const updatedLabel = freshnessLabel(query.dataUpdatedAt, now);

  const refreshAll = () => {
    void Promise.all(
      REFRESH_KEYS.map((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      ),
    );
  };

  // Today's booked/completed jobs, from the live Sales feed. In demo the feed
  // is anchored to a fixed month, so anchor the "today" lookup to the demo's
  // default day; a real session uses the actual date.
  const jobsDayIso = isDemo ? DEMO_DEFAULT_DAY : toIso(new Date(now));
  const todaysJobs = jobsOnDay(jobs, jobsDayIso);
  const jobsSubtitle = todaysJobs.slice(0, 3).map((j) => j.time).join(", ");

  // Finished jobs that have not yet been asked for a review (the actionable
  // count), from the live reviews feed.
  const reviewsToAsk =
    reviewsQuery.data?.contacts.filter((c) => !c.started).length ?? 0;

  // Build the priority feed. Every row appears only when it has something to act
  // on (or always, in the demo view). All four are now backed by live feeds, so
  // a real client only ever sees real counts.
  const cards: PriorityCard[] = [];
  if (summary) {
    if (summary.newToday > 0 || isDemo) {
      cards.push({
        key: "leads",
        title: "New leads to reply",
        subtitle: "Reply fast to lock them in",
        count: summary.newToday,
        to: "/sales/leads",
        Icon: UserPlus,
        stripe: "bg-[var(--brand-primary)]",
        chip: "bg-[var(--brand-tint)] text-[var(--brand-text)]",
        countColor: "text-[var(--brand-text)]",
      });
    }
    if (summary.unreadConversations > 0 || isDemo) {
      cards.push({
        key: "messages",
        title: "Messages waiting",
        subtitle: "Customers waiting on a reply",
        count: summary.unreadConversations,
        to: "/conversations",
        Icon: MessageSquare,
        stripe: "bg-[var(--brand-primary)]",
        chip: "bg-[var(--brand-tint)] text-[var(--brand-text)]",
        countColor: "text-[var(--brand-text)]",
      });
    }
    if (todaysJobs.length > 0) {
      cards.push({
        key: "jobs",
        title: todaysJobs.length === 1 ? "Job today" : "Jobs today",
        subtitle: jobsSubtitle || "On the schedule",
        count: todaysJobs.length,
        to: "/sales/jobs",
        Icon: Briefcase,
        stripe: "bg-amber-500",
        chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
        countColor: "text-amber-600 dark:text-amber-400",
      });
    }
    if (reviewsToAsk > 0) {
      cards.push({
        key: "reviews",
        title: "Reviews to request",
        subtitle: "Finished jobs ready for a review ask",
        count: reviewsToAsk,
        to: "/marketing/reviews/requests",
        Icon: Star,
        stripe: "bg-emerald-500",
        chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
        countColor: "text-emerald-600 dark:text-emerald-400",
      });
    }
  }

  // Sample week-at-a-glance figures. No week-level hook exists yet, so this row
  // only renders in the demo view.
  const weekTiles = [
    { key: "leads", label: "New leads", value: "18" },
    { key: "jobs", label: "Jobs booked", value: "6" },
    { key: "revenue", label: "Revenue", value: "$12k" },
  ];

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders HomeDesktop
          instead; both share the same TanStack Query cache so there is no
          double fetch. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh
        queryKeys={[["summary"], ["activity"], ["notifications"]]}
      />
      {isTest && <TestBanner />}

      <NavyHero flushTop={isTest}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <HeroMark initials={APP_BRAND.initials} />
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-bold text-white">
                {APP_BRAND.appName}
              </div>
              <div className="truncate text-[12px] text-white/60">
                {greeting(now)}, {today}
              </div>
              {updatedLabel && (
                <button
                  type="button"
                  onClick={refreshAll}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/40 transition-colors active:text-white/70"
                >
                  <RefreshCw
                    size={11}
                    className={query.isFetching ? "animate-spin" : undefined}
                    aria-hidden="true"
                  />
                  {updatedLabel}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <NotificationBell enabled={useReal} />
            <HeroIconButton label="Search" onClick={() => navigate("/leads")}>
              <Search size={18} />
            </HeroIconButton>
          </div>
        </div>

        <SplitHero
          primaryLabel="New leads today"
          primaryValue={summary ? summary.newToday : "--"}
          accentValue={summary ? summary.unreadConversations : 0}
          accentLabel="Unread"
        />
      </NavyHero>

      <div className="flex-1 overflow-y-auto pb-28">
        <NotificationPrompt />
        <CloseOutBanner className="mx-[22px] mt-5" />
        {query.isError ? (
          <div className="mx-[22px] mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load summary.{" "}
            {(query.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : query.isLoading ? (
          // First load only (no cached summary yet). Skeletons mirror the real
          // priority feed: a kicker then a few stacked cards. Background
          // refetches keep the live content and never fall back to this.
          <div aria-hidden="true">
            <div className="px-[22px] pb-2 pt-5">
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="mx-[22px] flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3.5 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                >
                  <Skeleton className="h-[38px] w-[38px] rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-7 w-8" />
                </div>
              ))}
            </div>
          </div>
        ) : !summary ? (
          <EmptyState
            title="You're all caught up"
            message="New leads and messages will show up here."
          />
        ) : (
          <>
            {/* Today: the priority feed. */}
            <div className="px-[22px] pb-2 pt-5">
              <span className="sec-kicker">Today</span>
            </div>
            {cards.length === 0 ? (
              <EmptyState
                title="You're all caught up"
                message="New leads and messages will show up here."
              />
            ) : (
              <div className="mx-[22px] flex flex-col gap-2.5">
                {cards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => navigate(card.to)}
                    className="relative flex items-center gap-3.5 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] py-4 pl-5 pr-4 text-left transition-colors active:bg-[var(--surface-2)]"
                  >
                    <span
                      className={"absolute inset-y-0 left-0 w-[3px] " + card.stripe}
                      aria-hidden="true"
                    />
                    <span
                      className={
                        "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl " +
                        card.chip
                      }
                    >
                      <card.Icon size={18} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                        {card.title}
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                        {card.subtitle}
                      </div>
                    </div>
                    <div
                      className={
                        "font-display text-[26px] font-black leading-none tracking-tight " +
                        card.countColor
                      }
                    >
                      {card.count}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* This week: sample-only glance, demo view only. */}
            {isDemo && (
              <>
                <div className="px-[22px] pb-2 pt-6">
                  <span className="sec-kicker">This week</span>
                </div>
                <div className="mx-[22px] grid grid-cols-3 gap-2.5">
                  {weekTiles.map((tile) => (
                    <div
                      key={tile.key}
                      className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3.5 text-center"
                    >
                      <div className="font-display text-[22px] font-black leading-none text-[var(--text)]">
                        {tile.value}
                      </div>
                      <div className="mt-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {tile.label}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Recent activity (webhook-sourced). Empty until events arrive. */}
            <div className="flex items-baseline justify-between px-[22px] pb-2 pt-6">
              <span className="sec-kicker">Recent activity</span>
            </div>
            {activity.length === 0 ? (
              <div className="mx-[22px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center text-[12.5px] text-[var(--text-muted)]">
                No recent activity yet.
              </div>
            ) : (
              <ul className="mx-[22px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
                {activity.slice(0, 10).map((a, idx, arr) => (
                  <li key={a.id}>
                    <div
                      className={
                        "flex items-center gap-3 px-4 py-3" +
                        (idx === arr.length - 1
                          ? ""
                          : " border-b border-[var(--divider)]")
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-[var(--text)]">
                          {activityTitle(a)}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11.5px] font-medium text-[var(--text-faint)]">
                        {activityWhen(a.created_at, now)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      </div>

      {/* Desktop client app (lg+): the Atelier command deck. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <HomeDesktop />
      </div>
    </Shell>
  );
}
