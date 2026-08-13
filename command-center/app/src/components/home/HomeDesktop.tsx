import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ClipboardCheck, MessageSquare } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import CloseOutBanner from "./CloseOutBanner";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import {
  useAdsTrackerQuery,
  useCalendarEventsQuery,
  useCloseOutCountQuery,
  useSummaryQuery,
} from "../../hooks/useApi";
import { formatMoney } from "../../lib/formatMoney";
import type { PipelineSummary } from "../../lib/api";

// The Atelier desktop Home: a two-column brief. The day on the left (what is
// booked and what needs you), the month on the right (what the work produced).
// Nothing is pushed below the fold on a normal window. The phone keeps its own
// NavyHero layout below lg; this renders only inside `hidden lg:flex`.
//
// No header panel. The greeting is the page's heading, and a panel reading
// "Home" directly above "Good afternoon" said the same thing twice.
//
// The agency's "Cold Calling" board is absent because the server never sends it
// (functions/lib/clientPipelines.ts), not because this file hides it.

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function shortName(name: string): string {
  return name
    .replace(/\s+Pipeline$/i, "")
    .replace(/^\d+\)\s*/, "")
    .trim();
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// A panel in the two-column brief. `action` is the one link out of it.
function Card({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-[14px] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
        <h2 className="font-display text-[14.5px] font-semibold text-text">{title}</h2>
        <button
          type="button"
          onClick={onAction}
          className="text-[12.5px] font-semibold text-brand-text hover:underline"
        >
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}

// One of the four small figures. `value` is already formatted; a null figure
// prints "--" rather than a zero we did not measure.
function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "brand" | "warning" | "positive";
}) {
  const color =
    tone === "brand"
      ? "text-brand-text"
      : tone === "warning"
        ? "text-warning"
        : tone === "positive"
          ? "text-positive"
          : "text-text";
  return (
    <div className="rounded-[11px] bg-surface-2 px-3.5 py-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
        {label}
      </div>
      <div className={`mt-0.5 font-display text-[23px] font-bold tabular-nums ${color}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

export default function HomeDesktop() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);

  const summaryQuery = useSummaryQuery(useReal);
  const calendarQuery = useCalendarEventsQuery(useReal);
  const closeOuts = useCloseOutCountQuery(useReal);
  // The month's own figures, from the same tracker Paid Ads reads. Shared query
  // key, so opening Paid Ads afterwards costs nothing.
  const tracker = useAdsTrackerQuery("last_30d", "ad", useReal);

  const summary = summaryQuery.data;
  const events = calendarQuery.data?.events ?? [];
  const kpis = tracker.data?.kpis;

  const today = new Date(now).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Today's appointments, earliest first, past ones dropped: this is a "what is
  // left today" list, not a log of the morning.
  const todaysAppointments = useMemo(
    () =>
      events
        .filter((e) => {
          if (!e.startTime) return false;
          const at = new Date(e.startTime);
          return isSameLocalDay(at, new Date(now)) && at.getTime() >= now;
        })
        .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1))
        .slice(0, 4),
    [events, now],
  );

  // Client-visible boards only; the server already dropped the agency's own.
  const pipelines: PipelineSummary[] = useMemo(
    () => [...(summary?.pipelines ?? [])].sort((a, b) => b.open - a.open).slice(0, 4),
    [summary],
  );

  const unread = summary?.unreadConversations ?? null;
  const closeOutCount = closeOuts.data?.count ?? null;

  return (
    <DesktopPage>
      {summaryQuery.isError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load your dashboard.{" "}
          {(summaryQuery.error as Error | null)?.message ?? "Try again."}
        </div>
      ) : (
        <>
          <CloseOutBanner />

          <h1 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-text">
            {greeting(now)}
          </h1>
          <div className="mb-4 mt-0.5 text-[12.5px] text-faint">{today}</div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* ---------- Your day ---------- */}
            <Card title="Your day" actionLabel="Calendar" onAction={() => navigate("/sales")}>
              {calendarQuery.isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div
                    className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-brand"
                    aria-hidden
                  />
                </div>
              ) : todaysAppointments.length === 0 ? (
                <div className="flex items-center gap-2.5 px-[18px] py-4 text-[13px] text-muted">
                  <CalendarDays size={16} className="shrink-0 text-faint" aria-hidden />
                  Nothing left on the calendar today.
                </div>
              ) : (
                <ul>
                  {todaysAppointments.map((e, i) => (
                    <li
                      key={e.id}
                      className={
                        "flex gap-3 px-[18px] py-2.5" +
                        (i === 0 ? "" : " border-t border-divider")
                      }
                    >
                      <span className="w-[58px] shrink-0 pt-px font-display text-[12.5px] font-bold tabular-nums text-brand-text">
                        {timeLabel(e.startTime!)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-text">
                          {e.title || "Appointment"}
                        </div>
                        {e.contactName && (
                          <div className="truncate text-[11.5px] text-muted">
                            {e.contactName}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto grid grid-cols-2 gap-2.5 px-[18px] pb-4 pt-3.5">
                <button type="button" onClick={() => navigate("/conversations")} className="text-left">
                  <Tile
                    label="Unread"
                    value={unread == null ? "--" : String(unread)}
                    sub={unread ? "needs a reply" : "all caught up"}
                    tone="brand"
                  />
                </button>
                <button type="button" onClick={() => navigate("/sales")} className="text-left">
                  <Tile
                    label="To close out"
                    value={closeOutCount == null ? "--" : String(closeOutCount)}
                    sub={closeOutCount ? "jobs done" : "nothing waiting"}
                    tone={closeOutCount ? "warning" : undefined}
                  />
                </button>
              </div>
            </Card>

            {/* ---------- This month ---------- */}
            <Card
              title="This month"
              actionLabel="Paid Ads"
              onAction={() => navigate("/marketing/paid-ads")}
            >
              <div className="grid grid-cols-2 gap-2.5 px-[18px] pb-1">
                <Tile
                  label="Leads"
                  value={kpis ? String(kpis.leads) : "--"}
                  sub={kpis ? `${kpis.bookings} booked` : "last 30 days"}
                />
                <Tile
                  label="Revenue"
                  value={kpis ? formatMoney(kpis.revenue) : "--"}
                  sub={kpis ? `${formatMoney(kpis.spend)} ad spend` : "last 30 days"}
                  tone={kpis && kpis.revenue > 0 ? "positive" : undefined}
                />
              </div>

              <div className="px-[18px] pb-4 pt-3">
                {summaryQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div
                      className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-brand"
                      aria-hidden
                    />
                  </div>
                ) : pipelines.length === 0 ? (
                  <div className="flex items-center gap-2.5 py-3 text-[13px] text-muted">
                    <ClipboardCheck size={16} className="shrink-0 text-faint" aria-hidden />
                    No pipelines to show yet.
                  </div>
                ) : (
                  pipelines.map((p) => {
                    const pct = p.total > 0 ? Math.round((p.open / p.total) * 100) : 0;
                    return (
                      <div key={p.id} className="mb-2.5 last:mb-0">
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="truncate font-semibold text-text">
                            {shortName(p.name)}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {p.open} open
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundImage: "var(--grad-brand)" }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                onClick={() => navigate("/conversations")}
                className="mt-auto flex items-center gap-2 border-t border-divider px-[18px] py-3 text-left text-[12.5px] font-semibold text-brand-text hover:underline"
              >
                <MessageSquare size={14} aria-hidden />
                Open the inbox
              </button>
            </Card>
          </div>
        </>
      )}
    </DesktopPage>
  );
}
