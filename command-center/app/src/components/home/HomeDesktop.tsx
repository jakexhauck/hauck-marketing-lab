import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Inbox,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "../ui/Button";
import DesktopPage from "../desktop/DesktopPage";
import ClientHero, { type ClientHeroKpi } from "./ClientHero";
import EmptyState from "../EmptyState";
import { useAuth } from "../../context/AuthContext";
import { usePipelines } from "../../context/PipelinesContext";
import { useNow } from "../../context/NowContext";
import {
  useActivityQuery,
  useCalendarEventsQuery,
  useSummaryQuery,
} from "../../hooks/useApi";
import { activityLabel } from "../../lib/activityLabels";
import type { ApiActivity, PipelineSummary } from "../../lib/api";

// The Atelier desktop Home: a calm, airy command deck that sits beside the
// Shell sidebar at lg+. The phone keeps its own (NavyHero) layout below lg;
// this file is rendered only inside `hidden lg:flex` from Home.tsx.

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function activityTitle(a: ApiActivity): string {
  return a.payload?.summary ?? activityLabel(a.action);
}

function activityWhen(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortName(name: string): string {
  return name.replace(/\s+Pipeline$/i, "").trim();
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function HomeDesktop() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { setSelectedId } = usePipelines();
  const now = useNow();
  const useReal = Boolean(session);

  const summaryQuery = useSummaryQuery(useReal);
  const activityQuery = useActivityQuery(useReal);
  const calendarQuery = useCalendarEventsQuery(useReal);

  const summary = summaryQuery.data;
  const activity = activityQuery.data?.activity ?? [];
  const events = calendarQuery.data?.events ?? [];

  const today = new Date(now).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const openLeads = useMemo(
    () => (summary?.pipelines ?? []).reduce((sum, p) => sum + p.open, 0),
    [summary],
  );

  const appointmentsToday = useMemo(
    () =>
      events.filter(
        (e) => e.startTime && isSameLocalDay(new Date(e.startTime), new Date(now)),
      ).length,
    [events, now],
  );

  const { featured, rest } = useMemo(() => {
    const ps = summary?.pipelines ?? [];
    if (ps.length === 0)
      return { featured: null, rest: [] as PipelineSummary[] };
    const sorted = [...ps].sort((a, b) => b.open - a.open);
    return { featured: sorted[0], rest: sorted.slice(1) };
  }, [summary]);

  const openCard = (pipelineId: string) => {
    setSelectedId(pipelineId);
    navigate("/leads");
  };

  // The same four month-to-date figures the flat tiles showed, folded into the
  // overview hero's KPI row.
  const heroKpis: ClientHeroKpi[] = [
    {
      icon: ArrowUpRight,
      label: "New leads today",
      value: summary ? summary.newToday : "--",
      sub: "across all pipelines",
    },
    {
      icon: MessageSquare,
      label: "Unread conversations",
      value: summary ? summary.unreadConversations : "--",
      sub:
        summary && summary.unreadConversations > 0
          ? "needs a reply"
          : "all caught up",
    },
    {
      icon: Users,
      label: "Open leads",
      value: summary ? openLeads : "--",
      sub: "currently in pipeline",
    },
    {
      icon: CalendarDays,
      label: "Appointments today",
      value: calendarQuery.isLoading ? "--" : appointmentsToday,
      sub: "on the calendar",
    },
  ];

  return (
    <DesktopPage
      title="Home"
      actions={
        <Button variant="primary" onClick={() => navigate("/leads")}>
          <TrendingUp size={16} />
          View pipeline
        </Button>
      }
    >
        {summaryQuery.isError ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            Failed to load your dashboard.{" "}
            {(summaryQuery.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : (
          <>
            {/* Overview hero: greeting, date, and the four month-to-date KPIs,
                glowing in the live client brand color. */}
            <ClientHero greeting={greeting(now)} subtitle={today} kpis={heroKpis} />

            {/* Two-column body */}
            <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
              {/* Pipeline overview */}
              <section className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between px-6 py-4">
                  <h2 className="font-display text-[16px] font-semibold text-text">
                    Pipeline overview
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigate("/leads")}
                    className="text-[13px] font-semibold text-brand-text hover:underline"
                  >
                    View all
                  </button>
                </div>

                {summaryQuery.isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div
                      className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand"
                      aria-hidden
                    />
                  </div>
                ) : !summary || !featured ? (
                  <div className="px-6 pb-6">
                    <EmptyState
                      title="No pipelines"
                      message="Pipelines configured in your CRM will show up here."
                    />
                  </div>
                ) : (
                  <div className="px-6 pb-6">
                    {/* Featured: busiest pipeline */}
                    <button
                      type="button"
                      onClick={() => openCard(featured.id)}
                      className="group block w-full rounded-[var(--radius-lg)] bg-brand-tint px-5 py-5 text-left transition-colors hover:bg-brand-tint-strong"
                    >
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-text">
                        <TrendingUp size={13} strokeWidth={2.5} />
                        Most active
                      </span>
                      <div className="mt-3 flex items-end justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-display text-[20px] font-bold text-text">
                            {shortName(featured.name)}
                          </div>
                          <div className="mt-1 text-[13px] font-medium text-muted">
                            {featured.open} open of {featured.total} leads
                          </div>
                        </div>
                        <div className="stat-num text-[44px] text-brand-text">
                          {featured.open}
                        </div>
                      </div>
                    </button>

                    {/* The rest */}
                    {rest.length > 0 && (
                      <ul className="fx-stagger mt-2">
                        {rest.map((p) => {
                          const pct =
                            p.total > 0
                              ? Math.round((p.open / p.total) * 100)
                              : 0;
                          return (
                            <li key={p.id} className="fx-item">
                              <button
                                type="button"
                                onClick={() => openCard(p.id)}
                                className="flex w-full items-center gap-4 rounded-[var(--radius)] px-2 py-3 text-left transition-colors hover:bg-surface-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[14px] font-semibold text-text">
                                    {shortName(p.name)}
                                  </div>
                                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                                    <div
                                      className="h-full rounded-full bg-brand/70"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="font-data text-[15px] font-semibold text-text tabular-nums">
                                  {p.open}
                                </div>
                                <ChevronRight
                                  size={16}
                                  className="text-faint"
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </section>

              {/* Recent activity */}
              <section className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between px-6 py-4">
                  <h2 className="font-display text-[16px] font-semibold text-text">
                    Recent activity
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigate("/activity")}
                    className="text-[13px] font-semibold text-brand-text hover:underline"
                  >
                    View all
                  </button>
                </div>
                <div className="px-6 pb-6">
                  {activityQuery.isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div
                        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-brand"
                        aria-hidden
                      />
                    </div>
                  ) : activity.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-[var(--radius)] bg-surface-2 px-4 py-5 text-[13px] text-muted">
                      <Inbox size={18} className="text-faint" />
                      No recent activity yet.
                    </div>
                  ) : (
                    <ul className="fx-stagger -mt-1">
                      {activity.slice(0, 8).map((a, idx, arr) => (
                        <li key={a.id} className="fx-item">
                          <div
                            className={
                              "flex items-center gap-3 py-3" +
                              (idx === arr.length - 1
                                ? ""
                                : " border-b border-divider")
                            }
                          >
                            <span
                              className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text">
                              {activityTitle(a)}
                            </div>
                            <span className="shrink-0 font-data text-[11.5px] text-faint tabular-nums">
                              {activityWhen(a.created_at, now)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
    </DesktopPage>
  );
}
