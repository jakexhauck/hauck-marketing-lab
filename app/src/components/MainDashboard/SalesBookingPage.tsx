// Sales > Book a Call — manual booking surface.
//
// Lets the user drop a contact onto ANY GoHighLevel calendar from inside the
// app: pick a calendar, find-or-create a contact, then either pick a real
// open slot (respects GHL availability) or force a custom time (override).
//
// This is purely a write path. It does NOT touch the sales pipeline — stage
// advancement is driven by GHL workflows on the user's side. Note that the
// separate "booking calendar" watcher on the Pipeline tab is a different
// concept: that one mirrors bookings IN; this one books OUT.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type {
  GhlCalendar,
  GhlContactLite,
  GhlConfigStatus,
} from "../../lib/types";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconPlus,
  IconSearch,
  IconUser,
} from "../icons";
import "./pipeline-hub.css";
import "./sales-booking.css";

interface SalesBookingPageProps {
  root: string | null;
}

const BROWSER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

type LoadState =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "error"; message: string }
  | { kind: "ready"; calendars: GhlCalendar[] };

export function SalesBookingPage(_props: SalesBookingPageProps) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    let status: GhlConfigStatus;
    try {
      status = await api.ghlGetConfigStatus();
    } catch (err) {
      setLoad({ kind: "error", message: errText(err) });
      return;
    }
    if (!status.configured) {
      setLoad({ kind: "unconfigured" });
      return;
    }
    try {
      const calendars = await api.ghlListCalendars();
      setLoad({ kind: "ready", calendars });
    } catch (err) {
      setLoad({ kind: "error", message: errText(err) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            CRM · GoHighLevel
          </div>
          <h1 className="hml-page-title">Book a Call</h1>
          <div className="hml-page-subtitle">
            Manually book a contact onto any GoHighLevel calendar. Pipeline
            stages are handled by your GHL workflows.
          </div>
        </div>
      </section>

      {load.kind === "loading" && (
        <Panel>
          <Empty title="Loading…" />
        </Panel>
      )}

      {load.kind === "unconfigured" && (
        <Panel>
          <Empty
            title="Not connected to GoHighLevel"
            sub="Add your Private Integration token + Location ID in Settings. The token also needs calendar write scope (calendars/events.write) to book."
          />
        </Panel>
      )}

      {load.kind === "error" && (
        <Panel>
          <Empty title="Couldn’t reach GoHighLevel" sub={load.message} />
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              type="button"
              className="hml-btn hml-ghost"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        </Panel>
      )}

      {load.kind === "ready" && <BookingForm calendars={load.calendars} />}
    </div>
  );
}

// ── booking form ────────────────────────────────────────────

type TimeMode = "slots" | "custom";

function BookingForm({ calendars }: { calendars: GhlCalendar[] }) {
  const activeCalendars = useMemo(
    () => calendars.filter((c) => c.isActive !== false),
    [calendars],
  );

  const [calendarId, setCalendarId] = useState<string>("");
  const [contact, setContact] = useState<GhlContactLite | null>(null);
  const [timeMode, setTimeMode] = useState<TimeMode>("slots");

  // slot mode
  const [day, setDay] = useState<string>(todayYMD());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);

  // custom mode
  const [customTime, setCustomTime] = useState<string>("");

  const [title, setTitle] = useState<string>("");
  const [notify, setNotify] = useState(true);

  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState<{ startIso: string } | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  // Pull open slots whenever the calendar or day changes in slot mode.
  useEffect(() => {
    if (timeMode !== "slots" || !calendarId || !day) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsError(null);
    setChosenSlot(null);
    const { startIso, endIso } = dayWindowIso(day);
    void api
      .ghlGetFreeSlots(calendarId, startIso, endIso, BROWSER_TZ)
      .then((s) => {
        if (!cancelled) setSlots(s);
      })
      .catch((err) => {
        if (!cancelled) setSlotsError(errText(err));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeMode, calendarId, day]);

  const canBook =
    !!calendarId &&
    !!contact &&
    (timeMode === "slots" ? !!chosenSlot : !!customTime) &&
    !booking;

  const book = useCallback(async () => {
    if (!calendarId || !contact) return;
    let startTime: string;
    let ignoreAvailability = false;
    if (timeMode === "slots") {
      if (!chosenSlot) return;
      startTime = chosenSlot; // ISO already carries an offset
    } else {
      if (!customTime) return;
      // datetime-local is wall time in the browser's zone → absolute instant.
      const d = new Date(customTime);
      if (Number.isNaN(d.getTime())) {
        setBookError("That date/time isn’t valid.");
        return;
      }
      startTime = d.toISOString();
      ignoreAvailability = true;
    }
    setBooking(true);
    setBookError(null);
    try {
      const res = await api.ghlCreateAppointment({
        calendarId,
        contactId: contact.id,
        startTime,
        title: title.trim() || null,
        timezone: BROWSER_TZ,
        ignoreAvailability,
        notify,
      });
      setResult({ startIso: res.startIso });
    } catch (err) {
      setBookError(errText(err));
    } finally {
      setBooking(false);
    }
  }, [calendarId, contact, timeMode, chosenSlot, customTime, title, notify]);

  const reset = useCallback(() => {
    setResult(null);
    setContact(null);
    setChosenSlot(null);
    setCustomTime("");
    setTitle("");
    setBookError(null);
  }, []);

  if (result) {
    const calName =
      calendars.find((c) => c.id === calendarId)?.name ?? "calendar";
    return (
      <Panel>
        <div className="hml-empty">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(122, 162, 247, 0.14)",
              color: "#7aa2f7",
              marginBottom: 12,
            }}
          >
            <IconCheck size={22} />
          </div>
          <div className="hml-empty-title">Booked.</div>
          <div className="hml-empty-sub">
            {contact?.name ?? "Contact"} is on <strong>{calName}</strong> for{" "}
            <strong>{formatFull(result.startIso)}</strong>.
            {notify ? " GHL will send the confirmation." : ""}
          </div>
          <button
            type="button"
            className="hml-btn hml-primary"
            onClick={reset}
            style={{ marginTop: 18 }}
          >
            Book another
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="sb-form">
      {/* Step 1 — calendar */}
      <Panel>
        <Step n={1} label="Calendar" icon={<IconCalendar size={14} />} />
        {activeCalendars.length === 0 ? (
          <div className="hml-empty-sub" style={{ padding: "4px 2px" }}>
            No active calendars in this GHL location.
          </div>
        ) : (
          <select
            className="sb-select"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          >
            <option value="">Select a calendar…</option>
            {activeCalendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Panel>

      {/* Step 2 — contact */}
      <Panel>
        <Step n={2} label="Who" icon={<IconUser size={14} />} />
        {contact ? (
          <div className="sb-chip-row">
            <div className="sb-contact-chip">
              <span className="sb-chip-avatar">
                {initials(contact.name ?? contact.email ?? "?")}
              </span>
              <span className="sb-chip-text">
                <span className="sb-chip-name">
                  {contact.name ?? "(no name)"}
                </span>
                {(contact.email || contact.phone) && (
                  <span className="sb-chip-sub">
                    {contact.email ?? contact.phone}
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              className="hml-btn hml-ghost sb-sm"
              onClick={() => setContact(null)}
            >
              Change
            </button>
          </div>
        ) : (
          <ContactPicker onPick={setContact} />
        )}
      </Panel>

      {/* Step 3 — time */}
      <Panel>
        <Step n={3} label="When" icon={<IconClock size={14} />} />
        <div className="sb-tz-note">Times shown in {BROWSER_TZ}.</div>
        <div className="sb-mode-toggle">
          <button
            type="button"
            className={`sb-mode${timeMode === "slots" ? " sb-mode-on" : ""}`}
            onClick={() => setTimeMode("slots")}
          >
            Open slots
          </button>
          <button
            type="button"
            className={`sb-mode${timeMode === "custom" ? " sb-mode-on" : ""}`}
            onClick={() => setTimeMode("custom")}
          >
            Custom time
          </button>
        </div>

        {timeMode === "slots" ? (
          <div className="sb-slots-wrap">
            <input
              type="date"
              className="sb-select sb-date"
              value={day}
              min={todayYMD()}
              onChange={(e) => setDay(e.target.value)}
            />
            {!calendarId && (
              <div className="hml-empty-sub sb-hint">
                Pick a calendar first.
              </div>
            )}
            {calendarId && slotsLoading && (
              <div className="hml-empty-sub sb-hint">Loading slots…</div>
            )}
            {calendarId && slotsError && (
              <div className="hml-empty-sub sb-hint sb-err">{slotsError}</div>
            )}
            {calendarId &&
              !slotsLoading &&
              !slotsError &&
              slots &&
              slots.length === 0 && (
                <div className="hml-empty-sub sb-hint">
                  No open slots that day. Try another date, or switch to
                  Custom time to override.
                </div>
              )}
            {calendarId && slots && slots.length > 0 && (
              <div className="sb-slot-grid">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`sb-slot${chosenSlot === s ? " sb-slot-on" : ""}`}
                    onClick={() => setChosenSlot(s)}
                  >
                    {formatTime(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="sb-slots-wrap">
            <input
              type="datetime-local"
              className="sb-select sb-date"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
            <div className="hml-empty-sub sb-hint">
              Override: this skips the calendar’s availability check and books
              the exact time you enter.
            </div>
          </div>
        )}
      </Panel>

      {/* Step 4 — details + confirm */}
      <Panel>
        <Step n={4} label="Details" icon={<IconCheck size={14} />} />
        <input
          type="text"
          className="sb-select"
          placeholder="Appointment title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="sb-check">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span>Send GHL confirmation &amp; reminders to the contact</span>
        </label>

        {bookError && <div className="sb-hint sb-err">{bookError}</div>}

        <button
          type="button"
          className="hml-btn hml-primary sb-book"
          disabled={!canBook}
          onClick={() => void book()}
        >
          {booking ? "Booking…" : "Book appointment"}
        </button>
      </Panel>
    </div>
  );
}

// ── contact picker ──────────────────────────────────────────

function ContactPicker({ onPick }: { onPick: (c: GhlContactLite) => void }) {
  const [mode, setMode] = useState<"search" | "create">("search");

  // search state
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<GhlContactLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);

  // create state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "search") return;
    const q = term.trim();
    if (debounce.current) window.clearTimeout(debounce.current);
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    debounce.current = window.setTimeout(() => {
      void api
        .ghlSearchContacts(q)
        .then((r) => setResults(r))
        .catch((err) => setSearchError(errText(err)))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [term, mode]);

  const create = useCallback(async () => {
    if (!name.trim()) {
      setCreateError("A name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const c = await api.ghlCreateContact(
        name.trim(),
        email.trim() || undefined,
        phone.trim() || undefined,
      );
      onPick(c);
    } catch (err) {
      setCreateError(errText(err));
    } finally {
      setCreating(false);
    }
  }, [name, email, phone, onPick]);

  return (
    <div>
      <div className="sb-mode-toggle">
        <button
          type="button"
          className={`sb-mode${mode === "search" ? " sb-mode-on" : ""}`}
          onClick={() => setMode("search")}
        >
          Find existing
        </button>
        <button
          type="button"
          className={`sb-mode${mode === "create" ? " sb-mode-on" : ""}`}
          onClick={() => setMode("create")}
        >
          New contact
        </button>
      </div>

      {mode === "search" ? (
        <>
          <label className="sb-search">
            <IconSearch size={13} />
            <input
              type="text"
              placeholder="Search name, email, or phone…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </label>
          {searching && <div className="sb-hint">Searching…</div>}
          {searchError && <div className="sb-hint sb-err">{searchError}</div>}
          {results && results.length === 0 && !searching && (
            <div className="sb-hint">
              No matches. Switch to “New contact” to create one.
            </div>
          )}
          {results && results.length > 0 && (
            <div className="sb-result-list">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="sb-result"
                  onClick={() => onPick(c)}
                >
                  <span className="sb-chip-avatar">
                    {initials(c.name ?? c.email ?? "?")}
                  </span>
                  <span className="sb-chip-text">
                    <span className="sb-chip-name">
                      {c.name ?? "(no name)"}
                    </span>
                    {(c.email || c.phone) && (
                      <span className="sb-chip-sub">
                        {c.email ?? c.phone}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="sb-create">
          <input
            type="text"
            className="sb-select"
            placeholder="Full name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email"
            className="sb-select"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="tel"
            className="sb-select"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {createError && <div className="sb-hint sb-err">{createError}</div>}
          <button
            type="button"
            className="hml-btn hml-ghost sb-sm"
            disabled={creating}
            onClick={() => void create()}
          >
            <IconPlus size={13} />
            {creating ? "Creating…" : "Create & select"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── small presentational helpers ────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="hml-panel">
      <div className="hml-panel-body">{children}</div>
    </section>
  );
}

function Step({
  n,
  label,
  icon,
}: {
  n: number;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="sb-step-head">
      <span className="sb-step-num">{n}</span>
      <span className="sb-step-icon">{icon}</span>
      <span className="sb-step-label">{label}</span>
    </div>
  );
}

function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="hml-empty">
      <div className="hml-empty-title">{title}</div>
      {sub && <div className="hml-empty-sub">{sub}</div>}
    </div>
  );
}

// ── date / format helpers ───────────────────────────────────

function todayYMD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local start-of-day → start-of-next-day window for a "YYYY-MM-DD" string. */
function dayWindowIso(ymd: string): { startIso: string; endIso: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
