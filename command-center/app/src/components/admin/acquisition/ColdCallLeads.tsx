import { useMemo, useState } from "react";
import { Phone, PhoneOff, CalendarClock, CalendarCheck, Ban, ChevronRight } from "lucide-react";
import type { AdminLead, AdminLeadStatus } from "../../../lib/api";
import { STATUS_META } from "../../../lib/adminLeads";
import { useAdminLeadsQuery, useUpdateAdminLead } from "../../../hooks/useAdminLeads";

// Cold Call > Leads: the page the caller lives on.
//
// Left, the queue. Right, the one prospect he is calling: their number large
// enough to dial from across a desk, and four buttons for how it went. Pressing
// one writes the outcome and moves him to the next prospect, so he never picks
// who to call and never types a total. That is deliberate, and it is what makes
// the numbers on the Scoreboard worth paying commission against.
//
// The list is the agency prospect book (the `leads` table). He may update a row
// he is working; he cannot add or delete one, which the API enforces by role.

// "To call" is the working queue: everything not yet resolved. Booked, Qualified,
// Closed and Dead have left the queue and live on their own pages.
const QUEUE_STATUSES: AdminLeadStatus[] = ["New", "Contacted", "No Answer"];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fullName(lead: AdminLead): string {
  const name = `${lead.firstName} ${lead.lastName}`.trim();
  return name || "Unnamed prospect";
}

// Digits only, so a number typed as "(555) 010-9999" still dials.
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default function ColdCallLeads() {
  const leadsQuery = useAdminLeadsQuery();
  const updateLead = useUpdateAdminLead();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Callback and Booked both need a date before they mean anything, so the
  // button opens an inline date field rather than writing a guess.
  const [pending, setPending] = useState<"callback" | "booked" | null>(null);
  const [pendingDate, setPendingDate] = useState("");

  const all = leadsQuery.data?.leads ?? [];
  const queue = useMemo(
    () => all.filter((l) => QUEUE_STATUSES.includes(l.status)),
    [all],
  );

  // Selection follows the queue: no explicit pick means the top of the list, and
  // a lead that leaves the queue hands over to whoever is now in its place.
  const selectedIndex = selectedId ? queue.findIndex((l) => l.id === selectedId) : 0;
  const selected = queue[selectedIndex >= 0 ? selectedIndex : 0] ?? null;

  const advance = (fromId: string) => {
    const i = queue.findIndex((l) => l.id === fromId);
    // The worked lead is about to leave the queue, so the next one shifts into
    // its index. At the end of the list, wrap back to the top.
    const next = queue[i + 1] ?? queue[0] ?? null;
    setSelectedId(next && next.id !== fromId ? next.id : null);
    setPending(null);
    setPendingDate("");
  };

  const logOutcome = (lead: AdminLead, fields: Parameters<typeof updateLead.mutate>[0]) => {
    updateLead.mutate(fields);
    advance(lead.id);
  };

  const noAnswer = (lead: AdminLead) =>
    logOutcome(lead, {
      id: lead.id,
      status: "No Answer",
      noAnswer: lead.noAnswer + 1,
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
    });

  const notInterested = (lead: AdminLead) =>
    logOutcome(lead, {
      id: lead.id,
      status: "Dead",
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
    });

  const confirmPending = (lead: AdminLead) => {
    if (!pendingDate) return;
    if (pending === "callback") {
      logOutcome(lead, {
        id: lead.id,
        status: "Contacted",
        followUpDate: pendingDate,
        lastContact: today(),
        firstContactDate: lead.firstContactDate ?? today(),
      });
    } else {
      logOutcome(lead, {
        id: lead.id,
        status: "Booked",
        appointmentDate: pendingDate,
        lastContact: today(),
        firstContactDate: lead.firstContactDate ?? today(),
      });
    }
  };

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading the list...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load the list. Reload to try again.</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* The queue */}
      <div className="pk-card overflow-hidden rounded-[var(--radius-lg)] border border-border">
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <span className="font-display text-[14px] font-semibold">To call</span>
          <span className="font-mono text-[12px] text-muted">{queue.length}</span>
        </div>
        {queue.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">
            Nothing left to call. Every prospect has been worked.
          </p>
        ) : (
          <ul className="max-h-[62dvh] overflow-y-auto">
            {queue.map((lead) => {
              const on = selected?.id === lead.id;
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
                    {on && <ChevronRight size={15} className="shrink-0 text-brand" aria-hidden />}
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

          {/* How it went */}
          <div className="mt-6">
            <div className="pk-section-h" style={{ marginBottom: 10 }}>
              How did it go
            </div>
            <div className="flex flex-wrap gap-2">
              <OutcomeButton
                icon={PhoneOff}
                label="No answer"
                onClick={() => noAnswer(selected)}
              />
              <OutcomeButton
                icon={Ban}
                label="Not interested"
                onClick={() => notInterested(selected)}
              />
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

            {pending && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="cc-date" className="text-[12.5px] text-muted">
                  {pending === "callback" ? "Call them back on" : "Meeting is on"}
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
                  onClick={() => confirmPending(selected)}
                >
                  Save and next
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="pk-card grid place-items-center rounded-[var(--radius-lg)] border border-border p-10 text-center">
          <div>
            <p className="font-display text-[16px] font-semibold">Queue is clear</p>
            <p className="mt-1 text-[13px] text-muted">
              Every prospect has been worked. Check Callbacks for who is due back.
            </p>
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
