import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  MapPin,
  MessageSquare,
  Video,
  X,
} from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import StatusBadge from "../components/StatusBadge";
import { groupByDayKey } from "../lib/dayGroups";
import { useAuth } from "../context/AuthContext";
import { useCalendarEventsQuery } from "../hooks/useApi";
import type { ApiCalendarEvent } from "../lib/api";

// Build date/time formatters bound to the location timezone (falls back to the
// device timezone when GHL did not report one).
function makeFormatters(tz: string | null) {
  const opts = (o: Intl.DateTimeFormatOptions) =>
    tz ? { ...o, timeZone: tz } : o;
  return {
    time: new Intl.DateTimeFormat("en-US", opts({ hour: "numeric", minute: "2-digit" })),
    dayHeader: new Intl.DateTimeFormat("en-US", opts({ weekday: "short", month: "short", day: "numeric" })),
    dayKey: new Intl.DateTimeFormat("en-CA", opts({ year: "numeric", month: "2-digit", day: "2-digit" })),
  };
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: "#dcfce7", fg: "#15803d", label: "Confirmed" },
  booked: { bg: "#dbeafe", fg: "#1d4ed8", label: "Booked" },
  showed: { bg: "#dcfce7", fg: "#15803d", label: "Showed" },
  cancelled: { bg: "#ffe4e6", fg: "#e11d48", label: "Cancelled" },
  noshow: { bg: "#fef3c7", fg: "#b45309", label: "No-show" },
  "no-show": { bg: "#fef3c7", fg: "#b45309", label: "No-show" },
  invalid: { bg: "#f1f5f9", fg: "#94a3b8", label: "Invalid" },
};

interface DayGroup {
  key: string;
  label: string;
  events: ApiCalendarEvent[];
}

export default function Calendar() {
  const navigate = useNavigate();
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const isTest = mode === "test";

  const query = useCalendarEventsQuery(useReal);
  const [openId, setOpenId] = useState<string | null>(null);

  const tz = query.data?.timezone ?? null;
  const events = useMemo(() => query.data?.events ?? [], [query.data]);
  const fmt = useMemo(() => makeFormatters(tz), [tz]);

  const groups = useMemo<DayGroup[]>(() => {
    const todayKey = fmt.dayKey.format(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = fmt.dayKey.format(tomorrow);

    const byDay = groupByDayKey(events, (ev) => {
      if (!ev.startTime) return null;
      const d = new Date(ev.startTime);
      return Number.isNaN(d.getTime()) ? null : fmt.dayKey.format(d);
    });

    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, evs]) => {
        let label: string;
        if (key === todayKey) label = "Today";
        else if (key === tomorrowKey) label = "Tomorrow";
        else label = fmt.dayHeader.format(new Date(evs[0].startTime as string));
        return { key, label, events: evs };
      });
  }, [events, fmt]);

  const openEvent = openId
    ? events.find((e) => e.id === openId) ?? null
    : null;

  return (
    <Shell>
      <PullToRefresh queryKeys={[["calendar"]]} />
      {isTest && <TestBanner />}

      <NavyHero flushTop={isTest}>
        <div className="flex items-center gap-2.5">
          <HeroIconButton label="Back to home" onClick={() => navigate("/home")}>
            <ChevronLeft size={20} />
          </HeroIconButton>
          <div className="min-w-0">
            <div className="font-display text-[17px] font-bold text-white">
              Calendar
            </div>
            <div className="truncate text-[12px] text-white/60">
              {query.isLoading
                ? "Loading..."
                : `${events.length} upcoming · next 30 days`}
            </div>
          </div>
        </div>
      </NavyHero>

      <main className="flex flex-1 flex-col gap-5 px-5 pb-28 pt-4">
        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load calendar.{" "}
            {(query.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : query.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
              aria-hidden="true"
            />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="No appointments"
            message="Booked appointments for the next 30 days will show up here."
          />
        ) : (
          groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <span className="sec-kicker px-1">{g.label}</span>
              <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                {g.events.map((ev, idx) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(ev.id)}
                      className={
                        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
                        (idx === g.events.length - 1
                          ? ""
                          : " border-b border-[var(--divider)]")
                      }
                    >
                      <div className="w-16 shrink-0 text-[13px] font-bold tabular-nums text-[var(--brand-primary)]">
                        {ev.startTime ? fmt.time.format(new Date(ev.startTime)) : ""}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                          {ev.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          {ev.contactName && (
                            <span className="truncate text-[12px] text-[var(--text-muted)]">
                              {ev.contactName}
                            </span>
                          )}
                          <StatusBadge {...(STATUS_STYLE[ev.status] ?? STATUS_STYLE.booked)} />
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {openEvent && (
        <AppointmentSheet
          event={openEvent}
          fmt={fmt}
          onClose={() => setOpenId(null)}
          onMessage={(contactId) => navigate(`/conversations/${contactId}`)}
        />
      )}
    </Shell>
  );
}

interface SheetProps {
  event: ApiCalendarEvent;
  fmt: ReturnType<typeof makeFormatters>;
  onClose: () => void;
  onMessage: (contactId: string) => void;
}

function AppointmentSheet({ event, fmt, onClose, onMessage }: SheetProps) {
  const start = event.startTime ? new Date(event.startTime) : null;
  const end = event.endTime ? new Date(event.endTime) : null;
  const range =
    start && end
      ? `${fmt.dayHeader.format(start)} · ${fmt.time.format(start)} to ${fmt.time.format(end)}`
      : start
        ? `${fmt.dayHeader.format(start)} · ${fmt.time.format(start)}`
        : "";

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-[var(--text)]">
              {event.title}
            </h2>
            <div className="mt-1">
              <StatusBadge {...(STATUS_STYLE[event.status] ?? STATUS_STYLE.booked)} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] active:scale-[0.96]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <dl className="mt-4 flex flex-col gap-3 border-t border-[var(--divider)] pt-4 text-sm">
          {range && (
            <div className="flex justify-between gap-3">
              <dt className="label-cap">When</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {range}
              </dd>
            </div>
          )}
          {event.contactName && (
            <div className="flex justify-between gap-3">
              <dt className="label-cap">With</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {event.contactName}
              </dd>
            </div>
          )}
          {event.address && (
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <MapPin size={15} aria-hidden="true" />
              <span className="break-words">{event.address}</span>
            </div>
          )}
          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 font-semibold underline"
              style={{ color: "var(--brand-primary)" }}
            >
              <Video size={15} aria-hidden="true" />
              <span className="break-all">Join meeting</span>
            </a>
          )}
          {event.notes && (
            <p className="whitespace-pre-wrap break-words text-[var(--text-muted)]">
              {event.notes}
            </p>
          )}
        </dl>

        {event.contactId && (
          <button
            type="button"
            onClick={() => onMessage(event.contactId)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white active:scale-[0.99]"
            style={{ background: "var(--brand-primary)" }}
          >
            <MessageSquare size={16} aria-hidden="true" />
            Open conversation
          </button>
        )}
      </div>
    </div>
  );
}
