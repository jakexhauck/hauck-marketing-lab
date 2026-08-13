import { useEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/cn";
import { SectionLabel } from "../paidads/adBuilderShared";
import {
  useCalendarSync,
  useClientCalendarsQuery,
  useSetBlockedCalendars,
  useSetCalendarHours,
  type CalendarDay,
  type ClientCalendar,
} from "../../../../hooks/useApi";

// Fulfillment > GHL > Calendars.
//
// The hours a client can be booked for, and what their own diary does to them.
//
// Two things are edited here and both write straight through to GoHighLevel.
// There is no draft state and no publish step, because the client's booking
// page is the only copy of any of it:
//
//   Hours    the days and times a customer may book. Written with
//            lib/ghlCalendarWrite.ts, which carries GHL's other settings back
//            with them: a bare openHours PUT silently resets slot length.
//   Busy     whether a commitment in the owner's own Google Calendar takes the
//            time off this calendar. That is the busy-block sync, and it runs
//            on its own every fifteen minutes; this page fires it on load and
//            after a change so the screen is never explaining a stale state.

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="shrink-0 rounded-lg border border-border bg-surface p-5">
      {children}
    </section>
  );
}

const timeBox =
  "rounded-[var(--radius)] border border-border bg-bg px-2 py-1 font-data text-[12.5px] text-text";

// One calendar: its hours, and whether the owner's diary takes time off it.
function CalendarCard({
  calendar,
  tenantId,
  onBusyToggle,
  busy,
}: {
  calendar: ClientCalendar;
  tenantId: string;
  onBusyToggle: () => void;
  busy: boolean;
}) {
  const saveHours = useSetCalendarHours(tenantId);
  // The edit buffer. Seeded from GHL and reseeded whenever the server's answer
  // changes, so a save that GHL adjusted is what stays on screen.
  const [days, setDays] = useState<CalendarDay[]>(calendar.days);
  useEffect(() => setDays(calendar.days), [calendar.days]);

  const dirty = JSON.stringify(days) !== JSON.stringify(calendar.days);

  const setRange = (day: number, index: number, field: "open" | "close", value: string) =>
    setDays((rows) =>
      rows.map((r) =>
        r.day === day
          ? {
              ...r,
              ranges: r.ranges.map((range, i) =>
                i === index ? { ...range, [field]: value } : range,
              ),
            }
          : r,
      ),
    );

  const toggleDay = (day: number) =>
    setDays((rows) =>
      rows.map((r) =>
        r.day === day
          ? {
              ...r,
              // Closing a day keeps nothing: reopening it offers the ordinary
              // working day rather than whatever was there in 2023.
              ranges: r.ranges.length > 0 ? [] : [{ open: "09:00", close: "17:00" }],
            }
          : r,
      ),
    );

  const addRange = (day: number) =>
    setDays((rows) =>
      rows.map((r) =>
        r.day === day ? { ...r, ranges: [...r.ranges, { open: "13:00", close: "17:00" }] } : r,
      ),
    );

  const removeRange = (day: number, index: number) =>
    setDays((rows) =>
      rows.map((r) =>
        r.day === day ? { ...r, ranges: r.ranges.filter((_, i) => i !== index) } : r,
      ),
    );

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionLabel>{calendar.name}</SectionLabel>
          {!calendar.active && <span className="text-[12px] text-faint">off in GHL</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-muted">When they are busy in Google</span>
          <button
            type="button"
            role="switch"
            aria-checked={busy}
            aria-label={`When ${calendar.name} clashes with their Google Calendar`}
            onClick={onBusyToggle}
            className={cn(
              "rounded-[var(--radius)] border px-3 py-1 text-[12.5px] font-semibold transition-colors",
              busy
                ? "border-brand bg-brand text-brand-fg"
                : "border-border bg-surface text-muted hover:border-brand",
            )}
          >
            {busy ? "Nobody can book" : "Still bookable"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {days.map((row) => {
          const open = row.ranges.length > 0;
          return (
            <div key={row.day} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={open}
                onClick={() => toggleDay(row.day)}
                className={cn(
                  "w-[104px] shrink-0 rounded-[var(--radius)] border px-2 py-1 text-left text-[12.5px] font-medium transition-colors",
                  open
                    ? "border-border bg-surface-2 text-text"
                    : "border-border bg-surface text-faint",
                )}
              >
                {DAY_LABELS[row.day]}
              </button>

              {!open ? (
                <span className="text-[12.5px] text-faint">Closed</span>
              ) : (
                row.ranges.map((range, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={range.open}
                      onChange={(e) => setRange(row.day, i, "open", e.target.value)}
                      className={timeBox}
                      aria-label={`${DAY_LABELS[row.day]} opens`}
                    />
                    <span className="text-[12.5px] text-faint">to</span>
                    <input
                      type="time"
                      value={range.close}
                      onChange={(e) => setRange(row.day, i, "close", e.target.value)}
                      className={timeBox}
                      aria-label={`${DAY_LABELS[row.day]} closes`}
                    />
                    {row.ranges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRange(row.day, i)}
                        className="px-1 text-[13px] text-faint hover:text-danger"
                        aria-label={`Remove this ${DAY_LABELS[row.day]} slot`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))
              )}

              {open && (
                <button
                  type="button"
                  onClick={() => addRange(row.day)}
                  className="text-[12px] text-faint hover:text-brand-text"
                >
                  add hours
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(dirty || saveHours.isPending || saveHours.isError) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saveHours.isPending}
            onClick={() => saveHours.mutate({ calendarId: calendar.id, days })}
            className="rounded-[var(--radius)] bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saveHours.isPending ? "Sending to GHL..." : "Send to GHL"}
          </button>
          <button
            type="button"
            onClick={() => setDays(calendar.days)}
            className="text-[12.5px] text-faint hover:text-text"
          >
            Undo
          </button>
          {saveHours.isError && (
            <span className="text-[12.5px] text-danger">
              {(saveHours.error as Error).message}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

export default function CalendarPanel({
  tenantId,
  clientName,
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
}) {
  const { data, isLoading, error } = useClientCalendarsQuery(tenantId);
  const saveBusy = useSetBlockedCalendars(tenantId);
  const sync = useCalendarSync(tenantId);

  // Unsaved busy switches, keyed by calendar id.
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  // The sync runs on its own schedule; this is here so the page is never
  // showing an answer that is up to fifteen minutes old. Once per client per
  // mount, and nothing on screen waits for it.
  const synced = useRef<string>("");
  useEffect(() => {
    if (!data?.googleLinked || synced.current === tenantId) return;
    synced.current = tenantId;
    sync.mutate();
  }, [data?.googleLinked, tenantId, sync]);

  if (isLoading) return <div className="pk-empty">Reading their calendars...</div>;
  if (error) return <div className="pk-empty">{(error as Error).message}</div>;
  if (!data) return null;

  const calendars = data.calendars;
  const isBusyBlocked = (c: ClientCalendar) => draft[c.id] ?? c.blocked;

  // A busy switch saves on the spot, then re-runs the sync so the blocks in GHL
  // match what the screen now says.
  const toggleBusy = (c: ClientCalendar) => {
    const next = { ...draft, [c.id]: !isBusyBlocked(c) };
    setDraft(next);
    const chosen = calendars.filter((cal) => next[cal.id] ?? cal.blocked);
    saveBusy.mutate(
      {
        calendarIds: chosen.map((cal) => cal.id),
        names: chosen.map((cal) => ({ id: cal.id, name: cal.name })),
      },
      {
        onSuccess: () => {
          setDraft({});
          sync.mutate();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionLabel>Google Calendar</SectionLabel>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                data.googleLinked ? "bg-success" : "bg-border",
              )}
            />
            <span className="text-text">
              {data.googleLinked
                ? `${clientName} has linked their calendar`
                : `${clientName} has not linked a calendar`}
            </span>
          </span>
          {!data.googleLinked && (
            <span className="text-[12px] text-faint">
              Until they do, only the hours below decide what a customer is offered.
            </span>
          )}
          {saveBusy.isError && (
            <span className="text-[12px] text-danger">
              {(saveBusy.error as Error).message}
            </span>
          )}
        </div>
      </Card>

      {!data.crmWired ? (
        <Card>
          <p className="text-[13px] text-faint">This client's GHL is not wired yet.</p>
        </Card>
      ) : calendars.length === 0 ? (
        <Card>
          <p className="text-[13px] text-faint">Their sub-account carries no calendars.</p>
        </Card>
      ) : (
        calendars.map((c) => (
          <CalendarCard
            key={c.id}
            calendar={c}
            tenantId={tenantId}
            busy={isBusyBlocked(c)}
            onBusyToggle={() => toggleBusy(c)}
          />
        ))
      )}
    </div>
  );
}
