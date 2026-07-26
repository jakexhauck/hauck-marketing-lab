import { useState } from "react";
import { Phone, PhoneOff, CalendarClock, CalendarCheck, Ban, ChevronRight } from "lucide-react";
import type { AdminLead } from "../../../lib/api";
import { STATUS_META } from "../../../lib/adminLeads";
import { useUpdateAdminLead } from "../../../hooks/useAdminLeads";
import BookingPanel from "./BookingPanel";

// The calling workspace: a queue on the left, the one prospect being called on
// the right, four buttons for how it went.
//
// Shared by Leads (the cold queue) and Callbacks (people who asked to be called
// back), because they are the same job. The only differences are which leads go
// in and what the left column is called, so those are props and nothing else is.
//
// Pressing an outcome writes the row and hands over the next prospect. The
// caller never picks who to call and never types a total, which is what makes
// the Scoreboard worth paying commission against.

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

export default function CallWorkspace({
  leads,
  queueTitle,
  emptyTitle,
  emptyHint,
  badgeFor,
}: Props) {
  const updateLead = useUpdateAdminLead();
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

  const logOutcome = (lead: AdminLead, fields: Record<string, unknown>) => {
    updateLead.mutate({ id: lead.id, ...fields } as Parameters<typeof updateLead.mutate>[0]);
    advance(lead.id);
  };

  // Every outcome except a fresh callback clears the follow-up date. Otherwise a
  // prospect who was called back stays on the Callbacks page forever and the
  // page stops being a list of things to do.
  const noAnswer = (lead: AdminLead) =>
    logOutcome(lead, {
      status: "No Answer",
      noAnswer: lead.noAnswer + 1,
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    });

  const notInterested = (lead: AdminLead) =>
    logOutcome(lead, {
      status: "Dead",
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    });

  // Callback is a local date; Booked is a real appointment on the agency
  // calendar and is written by the booking endpoint, not here.
  const confirmCallback = (lead: AdminLead) => {
    if (!pendingDate) return;
    logOutcome(lead, {
      status: "Contacted",
      followUpDate: pendingDate,
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
    });
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
                {[selected.source, selected.timezone].filter(Boolean).join(" · ") ||
                  "No source recorded"}
              </p>
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

          <div className="mt-6">
            <div className="pk-section-h" style={{ marginBottom: 10 }}>
              How did it go
            </div>
            <div className="flex flex-wrap gap-2">
              <OutcomeButton icon={PhoneOff} label="No answer" onClick={() => noAnswer(selected)} />
              <OutcomeButton icon={Ban} label="Not interested" onClick={() => notInterested(selected)} />
              <OutcomeButton
                icon={CalendarClock}
                label="Callback"
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
                  // The endpoint already wrote the lead and the appointment; just
                  // move him on to the next prospect.
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

function OutcomeButton({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
