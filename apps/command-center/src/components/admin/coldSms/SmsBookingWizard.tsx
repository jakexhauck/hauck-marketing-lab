import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import {
  ApiError,
  bookColdSmsCall,
  connectColdSmsGoogle,
  disconnectColdSmsGoogle,
  getColdSmsWeek,
  type ColdSmsCard,
  type ColdSmsProspect,
  type ColdSmsWeek,
} from "../../../lib/api";
import {
  PROSPECT_ZONES,
  dayKeyOf,
  formatDay,
  formatTime,
  hourOf,
  isOffHours,
  weekOf,
  zoneShort,
} from "../../../lib/coldSmsWeek";

// Book call: a three-step wizard over the card panel.
//   1. Time     the week in the PROSPECT'S zone (Jake, 2026-10-13: a Central
//               prospect gets the calendar in Central): Google Calendar (blue),
//               demos already booked (purple), open slots (green). Jake's own
//               time stays in the footer and on the confirm step.
//   2. Details  name, email, business, notes (their reply pre-filled).
//   3. Confirm  both times spelled out, then book.
// Booking saves their zone on the GHL contact so GHL's reminders quote their time.

const PX = 52; // pixels per hour
const FALLBACK_ZONE = "America/New_York";

type Step = 1 | 2 | 3;

export default function SmsBookingWizard({
  prospect,
  card,
  onClose,
  onBooked,
}: {
  prospect: ColdSmsProspect;
  card: ColdSmsCard;
  onClose: () => void;
  onBooked: (label: string, removed: string[]) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [offset, setOffset] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [theirZone, setTheirZone] = useState<string>(prospect.zone.zone ?? "");
  const c = prospect.contact;
  const [form, setForm] = useState({
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    business: c.business || card.business,
    notes: card.reply?.body ? `Replied: "${card.reply.body}"` : "",
  });

  // Week boundaries need the agency zone, which the server reports; New York
  // until the first answer lands (it is what the account is set to).
  const [zone, setZone] = useState(FALLBACK_ZONE);
  // The grid runs in their zone; Jake's zone only when theirs is unknown.
  const viewZone = theirZone || zone;
  const days = useMemo(() => weekOf(Date.now(), viewZone, offset), [viewZone, offset]);
  const range = { start: days[0].start, end: days[6].start + 24 * 3600_000 };

  const week = useQuery({
    queryKey: ["admin", "cold-sms", "week", viewZone, range.start],
    queryFn: () => getColdSmsWeek(range.start, range.end),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (week.data?.timezone && week.data.timezone !== zone) setZone(week.data.timezone);
  }, [week.data?.timezone, zone]);

  const sameZone = zoneShort(viewZone) === zoneShort(zone);

  const google = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) {
        const { redirectUrl } = await connectColdSmsGoogle();
        window.location.href = redirectUrl;
      } else {
        await disconnectColdSmsGoogle();
        await qc.invalidateQueries({ queryKey: ["admin", "cold-sms", "week"] });
      }
    },
  });

  const book = useMutation({
    mutationFn: () =>
      bookColdSmsCall({
        contactId: c.id,
        startTime: new Date(pick!).toISOString(),
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        business: form.business,
        timezone: theirZone,
        notes: form.notes,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin", "cold-sms", "week"] });
      onBooked(
        `${formatDay(pick!, viewZone)} at ${formatTime(pick!, viewZone)} ${zoneShort(viewZone, pick!)}`,
        res.removed ?? [],
      );
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const minutes = week.data?.calendar?.minutes ?? 30;
  const whenMine = pick ? `${formatDay(pick, zone)}, ${formatTime(pick, zone)} ${zoneShort(zone, pick)}` : "";
  const whenTheirs = pick
    ? `${formatDay(pick, viewZone)}, ${formatTime(pick, viewZone)} ${zoneShort(viewZone, pick)}`
    : "";

  const bookError = book.error instanceof ApiError ? (book.error.body as { error?: string } | null)?.error : book.error ? "x" : null;
  const bookErrorText =
    bookError === "slot_taken"
      ? "That time was just taken. Pick another."
      : bookError === "in_the_past"
        ? "That time has passed. Pick another."
        : bookError === "bad_email"
          ? "That email does not look right."
          : bookError
            ? "GHL did not book it. Try again."
            : "";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${form.business}`}
        className="fixed left-1/2 top-[4vh] z-[71] flex h-[92vh] w-[min(1100px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-surface shadow-2xl"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="font-display text-[17px] font-semibold text-text">Book {form.business}</h2>
          <ol className="flex gap-1.5">
            {(["Time", "Details", "Confirm"] as const).map((s, i) => (
              <li
                key={s}
                className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${
                  step === i + 1
                    ? "bg-[var(--brand-tint)] text-text"
                    : step > i + 1
                      ? "text-[var(--positive)]"
                      : "bg-surface-2 text-faint"
                }`}
              >
                {i + 1}. {s}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {step === 1 && (
            <>
              <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                <button
                  type="button"
                  aria-label="Previous week"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-surface disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() => setOffset((o) => Math.min(8, o + 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-surface"
                >
                  <ChevronRight size={16} />
                </button>
                <b className="font-display text-[14px] font-semibold text-text">
                  {formatDay(days[0].start + 12 * 3600_000, viewZone)} to {formatDay(days[6].start + 12 * 3600_000, viewZone)}
                </b>
                <label className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-muted">
                  Their zone
                  <select
                    value={theirZone}
                    onChange={(e) => setTheirZone(e.target.value)}
                    className="rounded-lg border border-[var(--border)] bg-surface-2 px-2 py-1.5 text-[12.5px] font-semibold text-text"
                  >
                    {!theirZone && <option value="">Unknown</option>}
                    {theirZone && !PROSPECT_ZONES.some((z) => z.zone === theirZone) && (
                      <option value={theirZone}>{theirZone}</option>
                    )}
                    {PROSPECT_ZONES.map((z) => (
                      <option key={z.zone} value={z.zone}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                  {prospect.zone.source && prospect.zone.source !== "contact" && theirZone === prospect.zone.zone && (
                    <span className="text-[11px] font-medium text-faint">
                      {prospect.zone.source === "state" ? "from state" : "from area code"}
                    </span>
                  )}
                </label>
              </div>

              <GoogleBar
                connected={Boolean(week.data?.google.connected)}
                busy={google.isPending}
                failed={google.isError}
                onConnect={() => google.mutate(true)}
                onDisconnect={() => google.mutate(false)}
              />

              {week.isLoading ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">
                  <Loader2 className="animate-spin" size={18} />
                </div>
              ) : week.isLoadingError ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">The calendar did not load.</div>
              ) : !week.data?.calendar ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">
                  No "Cold SMS" calendar in GoHighLevel.
                </div>
              ) : (
                <WeekGrid
                  days={days}
                  zone={viewZone}
                  myZone={zone}
                  sameZone={sameZone}
                  minutes={minutes}
                  data={week.data}
                  pick={pick}
                  onPick={setPick}
                />
              )}
            </>
          )}

          {step === 2 && (
            <div className="mx-auto grid w-full max-w-[680px] grid-cols-1 gap-3.5 px-5 py-6 sm:grid-cols-2">
              <Field label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <Field label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
              <Field label="Phone" value={c.phone} readOnly />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <div className="sm:col-span-2">
                <Field label="Business" value={form.business} onChange={(v) => setForm({ ...form, business: v })} />
              </div>
              <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint sm:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  className="resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] font-normal text-text outline-none focus:border-[var(--brand)]"
                />
              </label>
            </div>
          )}

          {step === 3 && pick && (
            <dl className="mx-auto mt-8 grid w-full max-w-[540px] grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-2xl border border-[var(--border)] p-5 text-[14px]">
              <Row label="Who" value={`${form.firstName} ${form.lastName}`.trim() || "-"} />
              <Row label="Business" value={form.business} />
              <Row label="Them" value={whenTheirs} />
              <Row label="You" value={sameZone ? "Same zone" : whenMine} />
              <Row label="Length" value={`${minutes} min`} />
              <Row label="Calendar" value={week.data?.calendar?.name ?? ""} />
              <Row label="Phone" value={c.phone} />
              {form.email && <Row label="Email" value={form.email} />}
              {form.notes && <Row label="Notes" value={form.notes} />}
            </dl>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2.5 border-t border-[var(--border)] px-5 py-3">
          <span className="text-[13.5px] font-semibold text-text">
            {pick ? (sameZone ? whenTheirs : `${whenTheirs} for them · ${formatTime(pick, zone)} ${zoneShort(zone, pick)} for you`) : "Pick an open time"}
          </span>
          {bookErrorText && <span className="text-[13px] font-semibold text-[var(--danger)]">{bookErrorText}</span>}
          <span className="flex-1" />
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="rounded-xl border border-[var(--border)] bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              disabled={!pick}
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--brand-fg,#fff)] disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={book.isPending || !pick}
              onClick={() => book.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--brand-fg,#fff)] disabled:opacity-50"
            >
              {book.isPending && <Loader2 size={15} className="animate-spin" />}
              Book call
            </button>
          )}
        </footer>
      </div>
    </>,
    document.body,
  );
}

export function GoogleBar({
  connected,
  busy,
  failed,
  onConnect,
  onDisconnect,
  bookedLabel = "Booked demos",
}: {
  connected: boolean;
  busy: boolean;
  failed: boolean;
  // Left out (Client > Setting): the calendar is the client's, linked in their
  // own app, so the bar only says whether it is linked.
  onConnect?: () => void;
  onDisconnect?: () => void;
  bookedLabel?: string;
}) {
  return (
    <div className="mx-5 mb-2.5 flex items-center gap-2.5 rounded-xl border border-[var(--border)] px-3.5 py-2 text-[13px] font-semibold text-text">
      <GoogleLogo />
      Google Calendar
      {failed && <span className="text-[12px] text-[var(--danger)]">Could not reach Google</span>}
      <span className="flex-1" />
      <span className="flex items-center gap-3 text-[11.5px] font-medium text-muted">
        <Legend color="#4f8cff" label="Google" />
        <Legend color="#a66cff" label={bookedLabel} />
        <Legend color="var(--positive)" label="Open" dashed />
      </span>
      {!onConnect || !onDisconnect ? (
        <span className={`text-[12.5px] font-semibold ${connected ? "text-[var(--positive)]" : "text-faint"}`}>
          {connected ? "Linked" : "Not linked"}
        </span>
      ) : connected ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDisconnect}
          className="rounded-lg border border-[var(--border)] bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-text"
        >
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onConnect}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#1f1f1f]"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Connect Google Calendar
        </button>
      )}
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="hidden items-center gap-1.5 md:inline-flex">
      <span
        className="h-2.5 w-2.5 rounded-[3px]"
        style={
          dashed
            ? { border: `1px dashed ${color}`, background: `color-mix(in srgb, ${color} 18%, transparent)` }
            : { background: color }
        }
        aria-hidden
      />
      {label}
    </span>
  );
}

export function WeekGrid({
  days,
  zone,
  myZone,
  sameZone,
  minutes,
  data,
  pick,
  onPick,
  onOpenDemo,
}: {
  days: ReturnType<typeof weekOf>;
  zone: string; // the zone the grid is drawn in: the prospect's
  myZone: string;
  sameZone: boolean;
  minutes: number;
  data: ColdSmsWeek;
  pick: number | null;
  // Left out on Sales > Calendar: there is no one to book, so open slots are
  // drawn but not clickable.
  onPick?: (ms: number) => void;
  // Sales > Calendar: a booked demo opens its prospect panel, like a card on the
  // Sales board. Google's copy of the same call (same start) opens it too.
  onOpenDemo?: (demo: ColdSmsWeek["demos"][number]) => void;
}) {
  const slots = data.slots.map((s) => +new Date(s));
  const demoAt = new Map(data.demos.map((d) => [+new Date(d.start), d]));
  const blocks = [
    ...data.google.events.map((e) => ({
      kind: "google" as const,
      title: e.title,
      start: +new Date(e.start),
      end: +new Date(e.end),
      demo: demoAt.get(+new Date(e.start)),
    })),
    ...data.demos.map((e) => ({ kind: "demo" as const, title: e.title, start: +new Date(e.start), end: +new Date(e.end), demo: e })),
  ].filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);

  // Hours shown: 8am to 6pm, stretched to fit anything earlier or later.
  const hoursAll = [...slots.map((t) => hourOf(t, zone)), ...blocks.map((b) => hourOf(b.start, zone))];
  const ends = [...slots.map((t) => hourOf(t, zone) + minutes / 60), ...blocks.map((b) => hourOf(b.end, zone) || 24)];
  const h0 = Math.max(0, Math.min(8, ...hoursAll.map(Math.floor)));
  const h1 = Math.min(24, Math.max(18, ...ends.map(Math.ceil)));
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const today = dayKeyOf(Date.now(), zone);
  const top = (ms: number) => (hourOf(ms, zone) - h0) * PX;
  const slotH = Math.max(22, (minutes / 60) * PX - 3);

  return (
    <div className="mx-5 mb-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-[var(--border)]">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
        <div className="sticky top-0 z-[2] border-b border-[var(--border)] bg-surface" />
        {days.map((d) => {
          const weekend = d.weekday === 0 || d.weekday === 6;
          return (
            <div
              key={d.key}
              className={`sticky top-0 z-[2] border-b border-[var(--border)] bg-surface py-2 text-center text-[12px] font-semibold text-muted ${
                weekend ? "opacity-60" : ""
              }`}
            >
              {new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(Date.UTC(d.year, d.month - 1, d.date))}
              <b className={`block font-display text-[18px] ${d.key === today ? "text-[var(--brand)]" : "text-text"}`}>{d.date}</b>
            </div>
          );
        })}

        <div>
          {hours.map((h) => (
            <div key={h} className="h-[52px] -translate-y-[7px] pr-1.5 text-right text-[10.5px] text-faint">
              {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const daySlots = slots.filter((t) => dayKeyOf(t, zone) === d.key);
          const dayBlocks = blocks.filter((b) => dayKeyOf(b.start, zone) === d.key);
          return (
            <div
              key={d.key}
              className="relative border-l border-[var(--border)]"
              style={{
                height: hours.length * PX,
                background: `repeating-linear-gradient(to bottom, transparent 0 ${PX - 1}px, var(--border) ${PX - 1}px ${PX}px)`,
              }}
            >
              {dayBlocks.map((b, i) => {
                const color = b.kind === "google" ? "#4f8cff" : "#a66cff";
                const demo = onOpenDemo && b.demo?.contactId ? b.demo : null;
                return (
                  <div
                    key={`${b.kind}-${i}`}
                    role={demo ? "button" : undefined}
                    tabIndex={demo ? 0 : undefined}
                    onClick={demo ? () => onOpenDemo!(demo) : undefined}
                    onKeyDown={
                      demo
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenDemo!(demo);
                            }
                          }
                        : undefined
                    }
                    className={`absolute left-[3px] right-[3px] overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-text ${
                      demo ? "cursor-pointer hover:brightness-110" : ""
                    }`}
                    style={{
                      top: top(b.start),
                      height: Math.max(18, ((b.end - b.start) / 3600_000) * PX - 2),
                      background: `color-mix(in srgb, ${color} 20%, var(--surface))`,
                      borderLeft: `3px solid ${color}`,
                    }}
                    title={`${b.title} · ${formatTime(b.start, zone)}`}
                  >
                    {b.title}
                    <span className="block font-medium opacity-75">{formatTime(b.start, zone)}</span>
                  </div>
                );
              })}
              {daySlots.map((t) => {
                const picked = pick === t;
                const off = isOffHours(t, zone);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={onPick ? () => onPick(t) : undefined}
                    disabled={!onPick}
                    aria-pressed={picked}
                    title={sameZone ? formatTime(t, zone) : `${formatTime(t, zone)} for them, ${formatTime(t, myZone)} for you`}
                    className={`absolute left-[3px] right-[3px] z-[1] overflow-hidden rounded-lg px-1.5 text-left text-[11px] font-semibold leading-tight transition-colors ${
                      picked
                        ? "bg-[var(--positive)] text-white"
                        : "border border-dashed border-[color-mix(in_srgb,var(--positive)_70%,transparent)] bg-[var(--positive-tint)] text-[var(--positive)] enabled:hover:bg-[color-mix(in_srgb,var(--positive)_26%,transparent)] disabled:cursor-default"
                    } ${off && !picked ? "opacity-45" : ""}`}
                    style={{ top: top(t) + 1, height: slotH }}
                  >
                    {formatTime(t, zone)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint">
      {label}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`rounded-xl border border-[var(--border)] px-3 py-2.5 text-[14px] font-normal text-text outline-none focus:border-[var(--brand)] ${
          readOnly ? "bg-surface-2 text-muted" : "bg-[var(--bg)]"
        }`}
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap font-semibold text-text">{value}</dd>
    </>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.5-9.5 6.5-16.1z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3V14H4.5C3 17 2 20.4 2 24s1 7 2.5 10l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  );
}
