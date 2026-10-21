import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import type { ColdSmsWeek } from "../../../lib/api";
import { formatDay, formatTime, weekOf, zoneShort } from "../../../lib/coldSmsWeek";
import { GoogleBar, WeekGrid } from "../coldSms/SmsBookingWizard";

// Book from Client > Setting: the Cold SMS Book call wizard (Jake, 2026-10-22),
// over the client's Estimate (or Job) calendar.
//   1. Time     the week in the client's zone: their linked Google Calendar
//               (blue, and never offered), appointments already on that
//               calendar (purple), open slots (green).
//   2. Details  the booking form (Street Address, Services, Notes), and the
//               amount for a job.
//   3. Confirm  then Book, which saves the same answer the outcome page saves
//               (api/setter-outcome POST), so the lead moves on the board too.
//
// Everything rides on the lead's signed outcome address (`outcomeUrl`).

type Step = 1 | 2 | 3;
type Kind = "estimate" | "job";

interface LeadInfo {
  name: string;
  phone: string;
  email: string;
  form: { address: string; services: string; notes: string };
  hasJobCalendar: boolean;
  timezone: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `${res.status}`);
  return body;
}

// "/api/setter-outcome?l=..&c=..&k=.." -> "/api/setter-outcome/<path>?l=..&c=..&k=.."
function sub(outcomeUrl: string, path: string, extra = ""): string {
  const [base, q] = outcomeUrl.split("?");
  return `${base}/${path}?${q}${extra}`;
}

export default function SettingBookingWizard({
  outcomeUrl,
  onClose,
  onBooked,
}: {
  outcomeUrl: string;
  onClose: () => void;
  onBooked: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("estimate");
  const [step, setStep] = useState<Step>(1);
  const [offset, setOffset] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [form, setForm] = useState({ address: "", services: "", notes: "" });
  const [amount, setAmount] = useState("");

  const lead = useQuery({
    queryKey: ["admin", "setting", "lead", outcomeUrl],
    queryFn: () => getJson<LeadInfo>(sub(outcomeUrl, "lead")),
    staleTime: Infinity,
  });
  useEffect(() => {
    if (lead.data) setForm(lead.data.form);
  }, [lead.data]);

  const zone = lead.data?.timezone ?? "America/New_York";
  const days = useMemo(() => weekOf(Date.now(), zone, offset), [zone, offset]);
  const range = { start: days[0].start, end: days[6].start + 24 * 3600_000 };

  const week = useQuery({
    queryKey: ["admin", "setting", "week", outcomeUrl, kind, range.start],
    enabled: lead.isSuccess,
    staleTime: 30_000,
    queryFn: () => getJson<ColdSmsWeek>(sub(outcomeUrl, "week", `&start=${range.start}&end=${range.end}&cal=${kind}`)),
  });

  const book = useMutation({
    mutationFn: async () => {
      const res = await fetch(outcomeUrl, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: kind === "estimate" ? "estimate_booked" : "job_closed",
          slot: new Date(pick!).toISOString(),
          form,
          ...(kind === "job" ? { amount } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "GHL did not book it. Try again.");
      return body.message ?? "Booked.";
    },
    onSuccess: (message) => {
      void qc.invalidateQueries({ queryKey: ["admin", "setting"] });
      onBooked(message);
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
  const when = pick ? `${formatDay(pick, zone)}, ${formatTime(pick, zone)} ${zoneShort(zone, pick)}` : "";
  const name = lead.data?.name ?? "lead";
  const needsAmount = kind === "job" && !(Number(amount.replace(/[$,\s]/g, "")) > 0);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${name}`}
        className="fixed left-1/2 top-[4vh] z-[71] flex h-[92vh] w-[min(1100px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-surface shadow-2xl"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="font-display text-[17px] font-semibold text-text">Book {name}</h2>
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
                  {formatDay(days[0].start + 12 * 3600_000, zone)} to {formatDay(days[6].start + 12 * 3600_000, zone)}
                </b>
                {lead.data?.hasJobCalendar && (
                  <div className="ml-auto flex overflow-hidden rounded-lg border border-[var(--border)]">
                    {(["estimate", "job"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setKind(k);
                          setPick(null);
                        }}
                        className={`px-3 py-1.5 text-[12.5px] font-semibold ${
                          kind === k ? "bg-[var(--brand-tint)] text-text" : "bg-surface text-muted"
                        }`}
                      >
                        {k === "estimate" ? "Estimate" : "Job"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <GoogleBar
                connected={Boolean(week.data?.google.connected)}
                busy={false}
                failed={false}
                bookedLabel="Booked"
              />

              {lead.isLoading || week.isLoading ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">
                  <Loader2 className="animate-spin" size={18} />
                </div>
              ) : lead.isError ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">{(lead.error as Error).message}</div>
              ) : week.isError || !week.data ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">The calendar did not load.</div>
              ) : !week.data.calendar ? (
                <div className="grid flex-1 place-items-center text-[13px] text-faint">
                  No {kind === "estimate" ? "Estimate" : "Job"} calendar in this sub-account.
                </div>
              ) : (
                <WeekGrid
                  days={days}
                  zone={zone}
                  myZone={zone}
                  sameZone
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
              <Field label="Name" value={name} readOnly />
              <Field label="Phone" value={lead.data?.phone ?? ""} readOnly />
              <div className="sm:col-span-2">
                <Field label="Street address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              </div>
              {kind === "job" && (
                <div className="sm:col-span-2">
                  <Field label="Job amount ($)" value={amount} onChange={setAmount} />
                </div>
              )}
              <Area label="Services" value={form.services} onChange={(v) => setForm({ ...form, services: v })} />
              <Area label="Any notes for the appointment" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
            </div>
          )}

          {step === 3 && pick && (
            <dl className="mx-auto mt-8 grid w-full max-w-[540px] grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-2xl border border-[var(--border)] p-5 text-[14px]">
              <Row label="Who" value={name} />
              <Row label="When" value={when} />
              <Row label="Length" value={`${minutes} min`} />
              <Row label="Calendar" value={week.data?.calendar?.name ?? ""} />
              <Row label="Phone" value={lead.data?.phone ?? ""} />
              {kind === "job" && <Row label="Amount" value={`$${amount}`} />}
              {form.address && <Row label="Address" value={form.address} />}
              {form.services && <Row label="Services" value={form.services} />}
              {form.notes && <Row label="Notes" value={form.notes} />}
            </dl>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2.5 border-t border-[var(--border)] px-5 py-3">
          <span className="text-[13.5px] font-semibold text-text">{pick ? when : "Pick an open time"}</span>
          {book.isError && (
            <span className="text-[13px] font-semibold text-[var(--danger)]">{(book.error as Error).message}</span>
          )}
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
              disabled={!pick || (step === 2 && needsAmount)}
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
              Book {kind === "estimate" ? "estimate" : "job"}
            </button>
          )}
        </footer>
      </div>
    </>,
    document.body,
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint">
      {label}
      <input
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

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-faint sm:col-span-2">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[14px] font-normal text-text outline-none focus:border-[var(--brand)]"
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
