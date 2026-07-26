import { useEffect, useState } from "react";
import {
  Phone,
  PhoneOff,
  CalendarClock,
  CalendarCheck,
  Ban,
  ChevronRight,
  Hand,
  Moon,
  CheckCircle2,
  TriangleAlert,
} from "lucide-react";
import type { AdminLead, ColdCallDialOutcome } from "../../../lib/api";
import { STATUS_META } from "../../../lib/adminLeads";
import { useUpdateAdminLead } from "../../../hooks/useAdminLeads";
import { useLogColdCallDial } from "../../../hooks/useColdCall";
import {
  isOutsideCallingHours,
  localTimeLabel,
  zoneForLead,
} from "../../../lib/leadLocalTime";
import BookingPanel from "./BookingPanel";

// The calling workspace: a queue on the left, the one prospect being called on
// the right, five buttons for how it went.
//
// Shared by Leads (the cold queue) and Callbacks (people who asked to be called
// back), because they are the same job. The only differences are which leads go
// in and what the left column is called, so those are props and nothing else is.
//
// Pressing an outcome does two things: it moves the lead on, and it appends one
// row to cold_call_dials (0052). That second write is what the Cold Call tracker
// and the Scoreboard count, so the daily numbers are a record of buttons pressed
// rather than figures somebody typed at the end of the day.
//
// The five outcomes exist because four could not tell "hung up on hello" from
// "heard the pitch and said no", and the difference between those two is the
// pass-through rate. See functions/lib/coldCallDials.ts for what each counts as.
//
// Each button also names a stage of the Cold Call Leads pipeline in the agency's
// GoHighLevel account, and pressing it moves the prospect there (0053). "Hot
// lead" carries the stage's own name for exactly that reason: it is the same
// thing said twice, so nobody has to translate between the two systems.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function fullName(lead: AdminLead): string {
  return `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed prospect";
}

// Digits only, so a number typed as "(555) 010-9999" still dials.
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export interface QueueBadge {
  text: string;
  tone: "late" | "now" | "soon";
}

interface Props {
  leads: AdminLead[];
  // Left column heading, e.g. "To call" or "Due back".
  queueTitle: string;
  // Shown in the left column when the list is empty, and in the right pane.
  emptyTitle: string;
  emptyHint: string;
  // Optional per-row chip, used by Callbacks for Overdue / Today / a date.
  badgeFor?: (lead: AdminLead) => QueueBadge | null;
}

// The prospect's own clock, re-read every half minute. Their time is the one
// thing on this card that changes while you look at it.
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export default function CallWorkspace({
  leads,
  queueTitle,
  emptyTitle,
  emptyHint,
  badgeFor,
}: Props) {
  const updateLead = useUpdateAdminLead();
  const logDial = useLogColdCallDial();
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Callback and Booked both need a date before they mean anything, so the
  // button opens an inline date field rather than writing a guess.
  const [pending, setPending] = useState<"callback" | "booked" | null>(null);
  const [pendingDate, setPendingDate] = useState("");

  // Selection follows the list: no explicit pick means the top, and a lead that
  // leaves the list hands over to whoever is now in its place.
  const selectedIndex = selectedId ? leads.findIndex((l) => l.id === selectedId) : 0;
  const selected = leads[selectedIndex >= 0 ? selectedIndex : 0] ?? null;

  const advance = (fromId: string) => {
    const i = leads.findIndex((l) => l.id === fromId);
    const next = leads[i + 1] ?? leads[0] ?? null;
    setSelectedId(next && next.id !== fromId ? next.id : null);
    setPending(null);
    setPendingDate("");
  };

  // The attempt is recorded first and the lead moved second. If the dial write
  // fails the lead still moves on: losing the count of one call is a smaller
  // wrong than stranding a prospect the caller has finished with.
  const logOutcome = (
    lead: AdminLead,
    outcome: ColdCallDialOutcome,
    fields: Record<string, unknown>,
    // Carried through to GoHighLevel, where it becomes the callback task.
    followUpDate?: string,
  ) => {
    logDial.mutate({ leadId: lead.id, outcome, followUpDate });
    updateLead.mutate({ id: lead.id, ...fields } as Parameters<typeof updateLead.mutate>[0]);
    advance(lead.id);
  };

  // Every outcome except a fresh callback clears the follow-up date. Otherwise a
  // prospect who was called back stays on the Callbacks page forever and the
  // page stops being a list of things to do.
  const noAnswer = (lead: AdminLead) =>
    logOutcome(lead, "no_answer", {
      status: "No Answer",
      noAnswer: lead.noAnswer + 1,
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    });

  // They picked up and it ended before the pitch. A pickup, not a pass-through,
  // and the lead stays workable: a bad moment is not a no.
  const brushOff = (lead: AdminLead) =>
    logOutcome(lead, "brush_off", {
      status: "Contacted",
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    });

  const notInterested = (lead: AdminLead) =>
    logOutcome(lead, "not_interested", {
      status: "Dead",
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    });

  // Callback is a local date; Booked is a real appointment on the agency
  // calendar and is written by the booking endpoint, not here.
  const confirmCallback = (lead: AdminLead) => {
    if (!pendingDate) return;
    logOutcome(
      lead,
      "callback",
      {
        status: "Contacted",
        followUpDate: pendingDate,
        lastContact: today(),
        firstContactDate: lead.firstContactDate ?? today(),
      },
      pendingDate,
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* The queue */}
      <div className="pk-card overflow-hidden rounded-[var(--radius-lg)] border border-border">
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <span className="font-display text-[14px] font-semibold">{queueTitle}</span>
          <span className="font-mono text-[12px] text-muted">{leads.length}</span>
        </div>
        {leads.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">{emptyHint}</p>
        ) : (
          <ul className="max-h-[62dvh] overflow-y-auto">
            {leads.map((lead) => {
              const on = selected?.id === lead.id;
              const badge = badgeFor?.(lead) ?? null;
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(lead.id);
                      setPending(null);
                    }}
                    className={[
                      "flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left transition-colors",
                      on ? "bg-surface-2" : "hover:bg-surface-2",
                    ].join(" ")}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_META[lead.status].swatch }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {fullName(lead)}
                      </span>
                      <span className="block truncate font-mono text-[12px] text-muted">
                        {lead.phone || "No number"}
                      </span>
                    </span>
                    {badge && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background:
                            badge.tone === "late"
                              ? "color-mix(in srgb, var(--danger) 14%, transparent)"
                              : badge.tone === "now"
                                ? "var(--brand-tint)"
                                : "var(--surface-2)",
                          color:
                            badge.tone === "late"
                              ? "var(--danger)"
                              : badge.tone === "now"
                                ? "var(--brand-text)"
                                : "var(--text-muted)",
                        }}
                      >
                        {badge.text}
                      </span>
                    )}
                    {on && !badge && (
                      <ChevronRight size={15} className="shrink-0 text-brand" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The call */}
      {selected ? (
        <div className="pk-card rounded-[var(--radius-lg)] border border-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em]">
                {fullName(selected)}
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                {selected.source || "No source recorded"}
              </p>
              <LocalTime lead={selected} now={now} />
            </div>
            <span className="font-mono text-[12px] text-muted">
              {selected.noAnswer > 0
                ? `${selected.noAnswer} no-answer${selected.noAnswer === 1 ? "" : "s"}`
                : "First attempt"}
            </span>
          </div>

          <a
            href={telHref(selected.phone)}
            className="mt-4 inline-flex items-center gap-3 font-mono text-[30px] font-semibold tracking-tight text-brand hover:underline"
          >
            <Phone size={22} aria-hidden />
            {selected.phone || "No number on file"}
          </a>

          {selected.email && (
            <p className="mt-2 font-mono text-[12.5px] text-muted">{selected.email}</p>
          )}

          {selected.notes && (
            <p className="mt-4 whitespace-pre-wrap rounded-[var(--radius)] bg-surface-2 px-4 py-3 text-[13px] leading-relaxed">
              {selected.notes}
            </p>
          )}

          <GhlState lead={selected} />

          <div className="mt-6">
            <div className="pk-section-h" style={{ marginBottom: 10 }}>
              How did it go
            </div>
            <div className="flex flex-wrap gap-2">
              <OutcomeButton icon={PhoneOff} label="No answer" onClick={() => noAnswer(selected)} />
              <OutcomeButton
                icon={Hand}
                label="Brush-off"
                title="They picked up, but you never got to the pitch"
                onClick={() => brushOff(selected)}
              />
              <OutcomeButton icon={Ban} label="Not interested" onClick={() => notInterested(selected)} />
              <OutcomeButton
                icon={CalendarClock}
                label="Hot lead"
                title="They heard the pitch and gave you a next step. Asks for the callback date."
                on={pending === "callback"}
                onClick={() => {
                  setPending(pending === "callback" ? null : "callback");
                  setPendingDate("");
                }}
              />
              <OutcomeButton
                icon={CalendarCheck}
                label="Booked"
                on={pending === "booked"}
                onClick={() => {
                  setPending(pending === "booked" ? null : "booked");
                  setPendingDate("");
                }}
              />
            </div>

            {pending === "callback" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="cc-date" className="text-[12.5px] text-muted">
                  Call them back on
                </label>
                <input
                  id="cc-date"
                  type="date"
                  className="pk-input !w-auto"
                  value={pendingDate}
                  min={today()}
                  onChange={(e) => setPendingDate(e.target.value)}
                />
                <button
                  type="button"
                  className="pk-btn-save"
                  disabled={!pendingDate}
                  onClick={() => confirmCallback(selected)}
                >
                  Save and next
                </button>
              </div>
            )}

            {pending === "booked" && (
              <BookingPanel
                lead={selected}
                onBooked={() => {
                  // The endpoint already wrote the lead and the appointment, so
                  // all that is left is the record of the call. Logged HERE
                  // rather than when the button was pressed: a recorded booking
                  // that never made it onto the calendar would be a lie the
                  // Scoreboard repeats every month.
                  logDial.mutate({ leadId: selected.id, outcome: "booked" });
                  advance(selected.id);
                }}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="pk-card grid place-items-center rounded-[var(--radius-lg)] border border-border p-10 text-center">
          <div>
            <p className="font-display text-[16px] font-semibold">{emptyTitle}</p>
            <p className="mt-1 text-[13px] text-muted">{emptyHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// What time it is where the prospect is, and a word when that time is one
// nobody should be rung at. Shows nothing at all when neither the lead's
// timezone nor its area code says where they are: a guessed clock would be
// worse than none, since the whole point is to be trusted before dialing.
function LocalTime({ lead, now }: { lead: AdminLead; now: number }) {
  const zone = zoneForLead(lead);
  if (!zone) return null;

  const late = isOutsideCallingHours(zone.zone, now);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
      <span
        className={late ? "font-semibold text-danger" : "text-text"}
        title={zone.zone}
      >
        {localTimeLabel(zone.zone, now)}
      </span>
      {zone.source === "areaCode" && (
        <span className="text-[12px] text-faint">from the area code</span>
      )}
      {late && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11.5px] font-semibold text-danger">
          <Moon size={12} aria-hidden />
          Outside 8am-9pm there
        </span>
      )}
    </p>
  );
}

// Where this prospect stands in the agency's GoHighLevel account.
//
// Silent until there is something to say. A prospect nobody has called yet is
// not "missing from the CRM", it is simply not called, and a warning on all 44
// rows would train everyone to ignore the one row that matters.
function GhlState({ lead }: { lead: AdminLead }) {
  if (lead.ghlError) {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-[var(--radius)] border border-danger/40 px-4 py-3 text-[12.5px] text-danger">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Not saved to GoHighLevel: {lead.ghlError} The call itself was recorded.
        </span>
      </p>
    );
  }

  if (!lead.ghlContactId) return null;

  return (
    <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted">
      <CheckCircle2 size={13} className="text-brand" aria-hidden />
      In GoHighLevel
    </p>
  );
}

function OutcomeButton({
  icon: Icon,
  label,
  title,
  on,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  title?: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-semibold transition-colors",
        on
          ? "border-brand bg-brand/10 text-brand"
          : "border-border text-text hover:border-brand hover:text-brand",
      ].join(" ")}
    >
      <Icon size={15} aria-hidden />
      {label}
    </button>
  );
}
