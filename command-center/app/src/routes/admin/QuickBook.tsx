import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, MapPin, Plus, Search, X } from "lucide-react";
import {
  useAdminClientsQuery,
  useSetterCalendarsQuery,
  useSetterSlotsQuery,
  useQuickBookFormQuery,
  useSetterContactSearch,
  useQuickBookMutation,
  type SetterContactHit,
} from "../../hooks/useApi";
import { useHomeScreenTarget } from "../../hooks/useHomeScreenTarget";
import { ApiError } from "../../lib/api";
import {
  STEPS,
  canAdvance,
  dayChip,
  defaultCalendarId,
  slotLong,
  slotTime,
  splitName,
  toE164,
  zoneAbbr,
  type QuickBookDraft,
} from "../../lib/quickBook";

// Quick Book (/admin/book, owner only). Jake has a client's caller on the
// phone and books them onto that client's calendar in four steps: Who, When,
// Details, Confirm. Picked from three mockups as "B: Steps" (2026-09-21).
//
// Rendered without AdminLayout: from the home screen icon it should open as
// its own app, with nothing on screen but the booking.
//
// Availability needs no work here. The client's Google busy time is pushed
// into their GHL estimate calendar every fifteen minutes (calendarSync.ts), so
// GHL's own free slots already leave it out.

const CLIENT_KEY = "hml_quickbook_client";
const calKey = (tenantId: string) => `hml_quickbook_cal:${tenantId}`;
const SLOT_DAYS = 14;

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the choice just is not remembered
  }
}

const EMPTY_PERSON = { contactId: "", firstName: "", lastName: "", phone: "", email: "" };

function errorCode(e: unknown): string {
  if (e instanceof ApiError) {
    const code = (e.body as { error?: string } | null)?.error;
    if (code) return code;
  }
  return "unknown";
}

const BOOK_ERRORS: Record<string, string> = {
  slot_taken: "That time was just taken. Pick another.",
  needs_staff: "This calendar has no team member assigned in GHL.",
  calendar_not_found: "This calendar no longer exists. Pick another.",
  contact_failed: "GHL refused the contact. Check the phone and email.",
};

export default function QuickBook() {
  useHomeScreenTarget("/book.webmanifest", "Book");

  const clientsQ = useAdminClientsQuery(true);
  const clients = useMemo(
    () =>
      (clientsQ.data?.clients ?? [])
        .filter((c) => c.ghlConnected)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clientsQ.data],
  );

  const [tenantId, setTenantId] = useState<string>(() => readKey(CLIENT_KEY) ?? "");
  useEffect(() => {
    if (clients.length === 0) return;
    if (!clients.some((c) => c.id === tenantId)) setTenantId(clients[0].id);
  }, [clients, tenantId]);

  const calendarsQ = useSetterCalendarsQuery(tenantId);
  const calendars = useMemo(
    () => (calendarsQ.data?.calendars ?? []).filter((c) => c.isActive),
    [calendarsQ.data],
  );
  const [calendarId, setCalendarId] = useState("");
  useEffect(() => {
    if (calendars.length === 0) return setCalendarId("");
    setCalendarId(defaultCalendarId(calendars, readKey(calKey(tenantId))));
  }, [calendars, tenantId]);

  const formQ = useQuickBookFormQuery(tenantId, calendarId);
  const tz = formQ.data?.timezone ?? "";
  const slotsQ = useSetterSlotsQuery(tenantId, calendarId, SLOT_DAYS, !!tz, tz || undefined);

  const [step, setStep] = useState(0);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookError, setBookError] = useState("");
  const [booked, setBooked] = useState<null | { when: string; name: string }>(null);

  const search = useSetterContactSearch(tenantId, creating || person.contactId ? "" : q);
  const book = useQuickBookMutation();

  const draft: QuickBookDraft = { tenantId, calendarId, ...person, slot };

  function resetFlow() {
    setStep(0);
    setPerson(EMPTY_PERSON);
    setCreating(false);
    setQ("");
    setDay("");
    setSlot("");
    setAnswers({});
    setBookError("");
    book.reset();
  }

  function pickClient(id: string) {
    setTenantId(id);
    writeKey(CLIENT_KEY, id);
    resetFlow();
  }
  function pickCalendar(id: string) {
    setCalendarId(id);
    writeKey(calKey(tenantId), id);
    setDay("");
    setSlot("");
    setAnswers({});
  }
  function pickContact(c: SetterContactHit) {
    const { firstName, lastName } = splitName(c.name);
    setPerson({ contactId: c.id, firstName, lastName, phone: c.phone, email: c.email });
  }

  const days = slotsQ.data?.days ?? [];
  const activeDay = days.find((d) => d.date === day) ?? days[0];

  async function submit() {
    setBookError("");
    const minutes = formQ.data?.slotMinutes ?? 60;
    const endTime = new Date(new Date(slot).getTime() + minutes * 60_000).toISOString();
    try {
      await book.mutateAsync({
        tenantId,
        calendarId,
        contactId: person.contactId || undefined,
        contact: {
          firstName: person.firstName.trim(),
          lastName: person.lastName.trim(),
          phone: person.phone ? toE164(person.phone) : "",
          email: person.email.trim(),
        },
        answers,
        startTime: slot,
        endTime,
      });
      setBooked({
        when: slotLong(slot, tz),
        name: `${person.firstName} ${person.lastName}`.trim(),
      });
    } catch (e) {
      const code = errorCode(e);
      setBookError(BOOK_ERRORS[code] ?? "GHL did not take the booking. Nothing was booked.");
      if (code === "slot_taken") {
        setSlot("");
        setStep(1);
        slotsQ.refetch();
      }
    }
  }

  const clientName = clients.find((c) => c.id === tenantId)?.name ?? "";
  const calendarName = calendars.find((c) => c.id === calendarId)?.name ?? "";

  if (booked) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-full text-white"
            style={{ backgroundImage: "var(--grad-brand)" }}
          >
            <Check size={30} strokeWidth={2.5} />
          </span>
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-text">Booked</h1>
          <dl className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-surface text-left">
            <Row label="Prospect" value={booked.name} />
            <Row label="When" value={`${booked.when} ${zoneAbbr(tz)}`} mono />
            <Row label="Client" value={clientName} />
            <Row label="Calendar" value={calendarName} />
          </dl>
        </div>
        <Dock>
          <button
            type="button"
            className="qb-cta"
            onClick={() => {
              setBooked(null);
              resetFlow();
            }}
          >
            Book another
          </button>
        </Dock>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Client + calendar. Native selects: on a phone they open the system
          picker, which beats any custom dropdown for one thumb. */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <SelectChip
          id="qb-client"
          label="Client"
          value={tenantId}
          onChange={pickClient}
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={clientsQ.isLoading ? "Loading" : "No clients"}
          grow
        />
        <SelectChip
          id="qb-calendar"
          label="Calendar"
          value={calendarId}
          onChange={pickCalendar}
          options={calendars.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={calendarsQ.isLoading ? "Loading" : "None"}
        />
      </div>

      <div className="flex gap-1.5 px-4 pt-4" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={"h-1 flex-1 rounded-full " + (i <= step ? "" : "bg-surface-3")}
            style={i <= step ? { backgroundImage: "var(--grad-brand)" } : undefined}
          />
        ))}
      </div>
      <div className="flex items-baseline justify-between px-4 pb-1 pt-4">
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-text">
          {STEPS[step]}
        </h1>
        <span className="font-mono text-[11px] text-faint">
          {step + 1} / {STEPS.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4 pt-2">
        {step === 0 && (
          <>
            {person.contactId ? (
              <div className="flex items-center gap-3 rounded-2xl border border-brand bg-surface p-3 shadow-[inset_0_0_0_1px_var(--brand)]">
                <Avatar name={`${person.firstName} ${person.lastName}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-text">
                    {person.firstName} {person.lastName}
                  </div>
                  <div className="truncate font-mono text-[12.5px] text-muted">
                    {person.phone || "No phone"}
                  </div>
                  <div className="truncate text-[12.5px] text-muted">{person.email || "No email"}</div>
                </div>
                <button
                  type="button"
                  aria-label="Change prospect"
                  className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted"
                  onClick={() => setPerson(EMPTY_PERSON)}
                >
                  <X size={16} />
                </button>
              </div>
            ) : creating ? (
              <>
                <Field id="qb-first" placeholder="First name" value={person.firstName} autoFocus
                  onChange={(v) => setPerson((p) => ({ ...p, firstName: v }))} />
                <Field id="qb-last" placeholder="Last name" value={person.lastName}
                  onChange={(v) => setPerson((p) => ({ ...p, lastName: v }))} />
                <Field id="qb-phone" placeholder="Phone" type="tel" value={person.phone}
                  onChange={(v) => setPerson((p) => ({ ...p, phone: v }))} />
                <Field id="qb-email" placeholder="Email" type="email" value={person.email}
                  onChange={(v) => setPerson((p) => ({ ...p, email: v }))} />
                <button
                  type="button"
                  className="self-start px-1 py-2 text-[14px] font-medium text-brand-text"
                  onClick={() => {
                    setCreating(false);
                    setPerson(EMPTY_PERSON);
                  }}
                >
                  Search instead
                </button>
              </>
            ) : (
              <>
                <label className="qb-field">
                  <Search size={18} className="shrink-0 text-faint" aria-hidden />
                  <input
                    id="qb-search"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    placeholder="Name or phone"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                {(search.data?.contacts ?? []).slice(0, 8).map((c) => (
                  <button key={c.id} type="button" className="qb-row" onClick={() => pickContact(c)}>
                    <Avatar name={c.name} />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-semibold text-text">{c.name}</span>
                      <span className="block truncate font-mono text-[12.5px] text-muted">
                        {c.phone || c.email}
                      </span>
                    </span>
                  </button>
                ))}
                {q.trim().length >= 2 && search.isFetched && (search.data?.contacts ?? []).length === 0 && (
                  <p className="px-1 text-[14px] text-muted">No match</p>
                )}
                <button
                  type="button"
                  className="qb-row justify-center border-dashed font-medium text-brand-text"
                  onClick={() => {
                    setCreating(true);
                    const digits = q.replace(/\D/g, "");
                    const looksLikePhone = digits.length >= 7 && digits.length >= q.trim().length - 4;
                    setPerson({
                      ...EMPTY_PERSON,
                      ...(looksLikePhone ? { phone: q.trim() } : splitName(q)),
                    });
                  }}
                >
                  <Plus size={16} /> New prospect
                </button>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            {slotsQ.isLoading || formQ.isLoading ? (
              <p className="px-1 text-[14px] text-muted">Loading times</p>
            ) : slotsQ.isError ? (
              <p className="px-1 text-[14px] text-danger">
                {errorCode(slotsQ.error) === "needs_staff"
                  ? BOOK_ERRORS.needs_staff
                  : "Could not load times from GHL."}
              </p>
            ) : days.length === 0 ? (
              <p className="px-1 text-[14px] text-muted">No open times in the next {SLOT_DAYS} days</p>
            ) : (
              <>
                {bookError && <p className="px-1 text-[14px] text-danger">{bookError}</p>}
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {days.map((d) => {
                    const chip = dayChip(d.date);
                    const on = d.date === activeDay?.date;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDay(d.date)}
                        className={
                          "flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 " +
                          (on ? "border-transparent text-white" : "border-border bg-surface text-text")
                        }
                        style={on ? { backgroundImage: "var(--grad-brand)" } : undefined}
                      >
                        <span className={"font-mono text-[10px] uppercase tracking-wider " + (on ? "text-white/80" : "text-faint")}>
                          {chip.dow}
                        </span>
                        <span className="font-display text-[18px] font-semibold">{chip.day}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2">
                  {(activeDay?.slots ?? []).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={slot === s}
                      onClick={() => setSlot(s)}
                      className={
                        "flex min-h-14 items-center justify-between rounded-xl border px-4 font-mono text-[16px] tabular-nums " +
                        (slot === s
                          ? "border-brand bg-brand-tint text-brand-text shadow-[inset_0_0_0_1px_var(--brand)]"
                          : "border-border bg-surface text-text")
                      }
                    >
                      {slotTime(s, tz)}
                      <span className="text-[11px] text-faint">{zoneAbbr(tz, new Date(s))}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            {(formQ.data?.fields ?? []).map((f) =>
              f.options ? (
                <label key={f.key} className="qb-field">
                  <select
                    id={`qb-f-${f.key}`}
                    value={answers[f.key] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    className={answers[f.key] ? "text-text" : "text-faint"}
                  >
                    <option value="">{f.label}</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="shrink-0 text-faint" aria-hidden />
                </label>
              ) : (
                <label key={f.key} className="qb-field">
                  {f.key === "address" && <MapPin size={18} className="shrink-0 text-faint" aria-hidden />}
                  {f.multiline ? (
                    <textarea
                      id={`qb-f-${f.key}`}
                      rows={3}
                      placeholder={f.label}
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      id={`qb-f-${f.key}`}
                      placeholder={f.label}
                      inputMode={f.key === "postal_code" ? "numeric" : undefined}
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  )}
                </label>
              ),
            )}
            {formQ.data && formQ.data.fields.length === 0 && (
              <p className="px-1 text-[14px] text-muted">No questions on this calendar</p>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <dl className="overflow-hidden rounded-2xl border border-border bg-surface">
              <Row label="Client" value={clientName} />
              <Row label="Calendar" value={calendarName} />
              <Row label="Prospect" value={`${person.firstName} ${person.lastName}`.trim()} />
              {person.phone && <Row label="Phone" value={person.phone} mono />}
              {person.email && <Row label="Email" value={person.email} />}
              <Row label="When" value={`${slotLong(slot, tz)} ${zoneAbbr(tz, new Date(slot))}`} mono />
              {(formQ.data?.fields ?? [])
                .filter((f) => (answers[f.key] ?? "").trim())
                .map((f) => (
                  <Row key={f.key} label={f.label} value={answers[f.key]} />
                ))}
            </dl>
            {bookError && <p className="px-1 text-[14px] text-danger">{bookError}</p>}
          </>
        )}
      </div>

      <Dock>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" className="qb-ghost" onClick={() => setStep((s) => s - 1)} disabled={book.isPending}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className="qb-cta"
              disabled={!canAdvance(step, draft)}
              onClick={() => {
                setBookError("");
                setStep((s) => s + 1);
              }}
            >
              Next
            </button>
          ) : (
            <button type="button" className="qb-cta" disabled={book.isPending} onClick={submit}>
              {book.isPending ? "Booking" : "Book"}
            </button>
          )}
        </div>
      </Dock>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="qb-root flex h-[100dvh] justify-center bg-bg">
      <div
        className="flex w-full max-w-[480px] flex-col"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {children}
      </div>
      <QuickBookStyle />
    </div>
  );
}

function Dock({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border-t border-border bg-bg px-4 pt-3"
      style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}
    >
      {children}
    </div>
  );
}

function SelectChip({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  grow,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  grow?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? placeholder;
  return (
    <label
      htmlFor={id}
      className={
        "relative flex min-h-12 min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 " +
        (grow ? "flex-[1.3]" : "flex-1")
      }
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-mono text-[10px] uppercase tracking-wider text-faint">{label}</span>
        <span className="block truncate text-[14px] font-medium text-text">{current}</span>
      </span>
      <ChevronDown size={14} className="shrink-0 text-faint" aria-hidden />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={options.length === 0}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  id,
  placeholder,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="qb-field">
      <input
        id={id}
        type={type}
        inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Avatar({ name }: { name: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-[13px] font-semibold text-white"
      style={{ backgroundImage: "var(--grad-brand)" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border px-3.5 py-3 text-[14px] first:border-t-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={"m-0 min-w-0 break-words text-right font-medium text-text " + (mono ? "font-mono text-[13px]" : "")}>
        {value}
      </dd>
    </div>
  );
}

function QuickBookStyle() {
  return (
    <style>{`
      .qb-root .qb-field {
        display: flex; align-items: center; gap: 10px;
        min-height: 52px; padding: 0 14px; border-radius: 14px;
        background: var(--surface); border: 1px solid var(--border);
      }
      .qb-root .qb-field:focus-within { border-color: var(--brand); }
      .qb-root .qb-field input, .qb-root .qb-field textarea, .qb-root .qb-field select {
        flex: 1; min-width: 0; border: 0; outline: none; background: none;
        font-size: 16px; color: var(--text); padding: 13px 0; appearance: none;
      }
      .qb-root .qb-field textarea { resize: none; }
      .qb-root .qb-field input::placeholder, .qb-root .qb-field textarea::placeholder { color: var(--text-faint); }
      .qb-root .qb-row {
        display: flex; align-items: center; gap: 12px; width: 100%;
        min-height: 64px; padding: 12px; border-radius: 16px;
        background: var(--surface); border: 1px solid var(--border);
      }
      .qb-root .qb-cta {
        flex: 1; width: 100%; min-height: 54px; border: 0; border-radius: 14px;
        background-image: var(--grad-brand); color: #fff;
        font-family: var(--font-display); font-weight: 600; font-size: 16px;
        box-shadow: 0 6px 18px color-mix(in srgb, var(--brand) 30%, transparent);
        transition: opacity .15s, transform .1s;
      }
      .qb-root .qb-cta:active:not(:disabled) { transform: scale(.98); }
      .qb-root .qb-cta:disabled { opacity: .4; box-shadow: none; }
      .qb-root .qb-ghost {
        min-height: 54px; padding: 0 20px; border-radius: 14px;
        background: var(--surface); border: 1px solid var(--border);
        font-family: var(--font-display); font-weight: 500; color: var(--text);
      }
      @media (prefers-reduced-motion: reduce) { .qb-root .qb-cta { transition: none; } }
    `}</style>
  );
}
