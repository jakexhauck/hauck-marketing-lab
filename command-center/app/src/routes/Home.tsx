import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  Filter,
  LogOut,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import Shell from "../components/Shell";
import HomeDesktop from "../components/home/HomeDesktop";
import NavyHero from "../components/NavyHero";
import SplitHero, { HeroMark, HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import BottomNav from "../components/BottomNav";
import EmptyState from "../components/EmptyState";
import NotificationPrompt from "../components/NotificationPrompt";
import NotificationBell from "../components/NotificationBell";
import { Skeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { usePipelines } from "../context/PipelinesContext";
import { useNow } from "../context/NowContext";
import PullToRefresh from "../components/PullToRefresh";
import { useActivityQuery, useSummaryQuery } from "../hooks/useApi";
import { APP_BRAND } from "../lib/appBrand";
import { activityLabel } from "../lib/activityLabels";
import { timeAgo } from "../lib/timeAgo";
import type { ApiActivity, PipelineSummary } from "../lib/api";

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

const CARD_COLORS = [
  "#1a4d8f",
  "#0e7490",
  "#7c3aed",
  "#b45309",
  "#15803d",
  "#be123c",
];

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function shortName(name: string): string {
  return name.replace(/\s+Pipeline$/i, "").trim();
}

// "Updated 2m ago" / "Updated just now" for the hero freshness line. Built from
// react-query's dataUpdatedAt so the time is real, never fabricated.
function freshnessLabel(updatedAt: number, now: number): string {
  if (!updatedAt) return "";
  const rel = timeAgo(new Date(updatedAt).toISOString(), now);
  // Collapse sub-minute updates into a calmer "just now".
  if (!rel || rel.endsWith("s ago")) return "Updated just now";
  return `Updated ${rel}`;
}

// The Home screen shares these query keys with pull-to-refresh; tapping the
// freshness line and overscrolling both invalidate the same set.
const REFRESH_KEYS: unknown[][] = [["summary"], ["activity"], ["notifications"]];

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, mode, signOut, isOwner, can } = useAuth();
  const { setSelectedId } = usePipelines();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useSummaryQuery(useReal);
  const activityQuery = useActivityQuery(useReal);

  // Sign out is destructive, so the row arms on first tap and only signs out on
  // the second. The arm auto-disarms after a few seconds so a stray tap cannot
  // leave it primed indefinitely.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  useEffect(() => {
    if (!confirmSignOut) return;
    const t = window.setTimeout(() => setConfirmSignOut(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirmSignOut]);

  const summary = query.data;
  const activity = activityQuery.data?.activity ?? [];
  const isTest = mode === "test";
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

  const openCard = (pipelineId: string) => {
    setSelectedId(pipelineId);
    navigate("/leads");
  };

  const colorOf = (id: string) => {
    const idx = summary?.pipelines.findIndex((p) => p.id === id) ?? 0;
    return CARD_COLORS[(idx < 0 ? 0 : idx) % CARD_COLORS.length];
  };

  // The featured pipeline is the busiest one by open leads; the rest fall into
  // the list below it.
  const { featured, rest } = useMemo(() => {
    const ps = summary?.pipelines ?? [];
    if (ps.length === 0) return { featured: null, rest: [] as PipelineSummary[] };
    const sorted = [...ps].sort((a, b) => b.open - a.open);
    return { featured: sorted[0], rest: sorted.slice(1) };
  }, [summary]);

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
        {query.isError ? (
          <div className="mx-[22px] mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load summary.{" "}
            {(query.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : query.isLoading ? (
          // First load only (no cached summary yet). Skeletons mirror the real
          // layout: featured card then the pipeline list rows. Background
          // refetches keep the live content and never fall back to this.
          <div aria-hidden="true">
            <div className="px-[22px] pb-1 pt-5">
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mx-[22px] h-[128px] w-[calc(100%-44px)] rounded-[18px]" />
            <div className="px-[22px] pb-2 pt-5">
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="mx-[22px] divide-y divide-[var(--divider)] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
                  <Skeleton className="h-[38px] w-[38px] rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-5 w-6" />
                </div>
              ))}
            </div>
          </div>
        ) : !summary || !featured ? (
          <EmptyState
            title="No pipelines"
            message="Pipelines configured in GHL will show up here."
          />
        ) : (
          <>
            {/* Featured: busiest pipeline */}
            <div className="px-[22px] pb-1 pt-5">
              <span className="sec-kicker">Most active</span>
            </div>
            <button
              type="button"
              onClick={() => openCard(featured.id)}
              className="mx-[22px] block w-[calc(100%-44px)] rounded-[18px] border p-4 text-left transition-transform active:scale-[0.99]"
              style={{
                background: `${colorOf(featured.id)}12`,
                borderColor: `${colorOf(featured.id)}30`,
              }}
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: colorOf(featured.id) }}
              >
                <TrendingUp size={12} strokeWidth={2.5} />
                Most active
              </span>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-[19px] font-extrabold text-[var(--text)]">
                    {shortName(featured.name)}
                  </div>
                  <div className="mt-0.5 text-[12.5px] font-medium text-[var(--text-muted)]">
                    {featured.open} open of {featured.total} leads
                  </div>
                </div>
                <div
                  className="font-display text-[44px] font-black leading-none tracking-tight"
                  style={{ color: colorOf(featured.id) }}
                >
                  {featured.open}
                </div>
              </div>
            </button>

            {/* The rest */}
            <div className="flex items-baseline justify-between px-[22px] pb-2 pt-5">
              <span className="sec-kicker">All pipelines</span>
              <span className="text-xs font-semibold text-[var(--text-faint)]">
                {summary.pipelines.length} active
              </span>
            </div>
            <ul className="mx-[22px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              {rest.map((p, idx) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openCard(p.id)}
                    className={
                      "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
                      (idx === rest.length - 1
                        ? ""
                        : " border-b border-[var(--divider)]")
                    }
                  >
                    <span
                      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: colorOf(p.id) }}
                    >
                      <Filter size={18} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                        {shortName(p.name)}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                        {p.open} open {p.open === 1 ? "lead" : "leads"}
                      </div>
                    </div>
                    <div className="font-display text-[20px] font-extrabold tracking-tight text-[var(--text)]">
                      {p.open}
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-faint)]" />
                  </button>
                </li>
              ))}
            </ul>

            {/* Quick links to secondary sections that do not earn a nav slot. */}
            <div className="px-[22px] pb-2 pt-6">
              <span className="sec-kicker">More</span>
            </div>
            <ul className="mx-[22px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              {[
                // Calendar + Billing honour the same per-surface permissions as
                // the sidebar/bottom nav; a staff member without view access must
                // not be offered a link the backend will refuse.
                ...(can("calendar", "view")
                  ? [{ key: "calendar", label: "Calendar", sub: "Upcoming appointments", to: "/calendar", Icon: CalendarDays, color: "#7c3aed" }]
                  : []),
                ...(can("billing", "view")
                  ? [{ key: "billing", label: "Billing", sub: "Invoices and payments", to: "/billing", Icon: Receipt, color: "#15803d" }]
                  : []),
                // Team management is owner-only (staff cannot add staff).
                ...(isOwner
                  ? [{ key: "team", label: "Team", sub: "Add employees and set access", to: "/team", Icon: Users, color: "#1a4d8f" }]
                  : []),
                { key: "settings", label: "Settings", sub: "Account and preferences", to: "/settings", Icon: Settings, color: "#475569" },
                { key: "signout", label: "Sign out", sub: "Log out of this device", to: "", Icon: LogOut, color: "#be123c" },
              ].map(
                (link, idx, arr) => {
                  const isSignout = link.key === "signout";
                  const confirming = isSignout && confirmSignOut;
                  const label = confirming ? "Tap again to sign out" : link.label;
                  const sub = confirming
                    ? "This logs you out of this device"
                    : link.sub;
                  return (
                  <li key={link.key}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSignout) {
                          // First tap arms the destructive action; only the
                          // second tap actually signs out. signOut tears down
                          // push + caches, then the route guard sends us to
                          // /login; navigate just makes it immediate.
                          if (!confirmSignOut) {
                            setConfirmSignOut(true);
                            return;
                          }
                          void signOut().then(() =>
                            navigate("/login", { replace: true }),
                          );
                          return;
                        }
                        navigate(link.to);
                      }}
                      className={
                        "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors" +
                        (confirming
                          ? " bg-rose-50 active:bg-rose-100 dark:bg-rose-950/50 dark:active:bg-rose-950"
                          : " active:bg-[var(--surface-2)]") +
                        (idx === arr.length - 1
                          ? ""
                          : " border-b border-[var(--divider)]")
                      }
                    >
                      <span
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: link.color }}
                      >
                        <link.Icon size={18} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            "truncate font-display text-[15px] font-bold" +
                            (confirming
                              ? " text-rose-700 dark:text-rose-300"
                              : " text-[var(--text)]")
                          }
                        >
                          {label}
                        </div>
                        <div
                          className={
                            "mt-0.5 text-[12px]" +
                            (confirming
                              ? " text-rose-600 dark:text-rose-400"
                              : " text-[var(--text-muted)]")
                          }
                        >
                          {sub}
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        className={
                          confirming
                            ? "text-rose-400 dark:text-rose-500"
                            : "text-[var(--text-faint)]"
                        }
                      />
                    </button>
                  </li>
                  );
                },
              )}
            </ul>

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

      <BottomNav active="home" />
    </Shell>
  );
}
