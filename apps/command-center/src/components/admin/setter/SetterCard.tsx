import { BellOff, CalendarClock, Hourglass, Timer } from "lucide-react";
import { dndBadgeLabel } from "../../../lib/setterInbox";
import {
  cardRail,
  formatOutcome,
  isNoAnswerStage,
  noAnswerWait,
  speedToLead,
  staleWaitingLabel,
} from "../../../lib/setterModel";
import {
  confirmState,
  formatApptTime,
  isAwaitingConfirm,
  type LeadAppointment,
} from "../../../lib/setterApptConfirm";
import { timeAgo } from "../../../lib/timeAgo";
import type { ApiSetterLead } from "../../../lib/api";

interface Props {
  lead: ApiSetterLead;
  // The column's semantic tone (SetterBoard's stageTone), painted as the
  // card's inset rail so a card reads as part of its stage even when it is
  // the only thing on screen (cockpit open, board scrolled).
  stageColor: string;
  stageNeedsDialing: boolean;
  now: number;
  selected: boolean;
  // Mid-automation (setterAutomationLock.ts): greyed, unclickable, with a
  // running badge, until the CRM automation's result shows on the board.
  locked: boolean;
  // This lead's session-local dial ticks for its current stage (may be
  // undefined or shorter than the 3 checkboxes; missing = unticked). Renders
  // as a small segment bar once at least one dial is ticked.
  dialChecks?: boolean[];
  // The funnel booking this lead is being confirmed for (only set for leads
  // in an "Appt Booked" stage). Drives the appointment chip and, inside the
  // final 24h, the manual-confirm alert.
  appointment?: LeadAppointment | null;
  onSelect: (lead: ApiSetterLead) => void;
}

const DIAL_SEGMENTS = 3;

// One board card. Deliberately does not open anything: the lead detail
// cockpit is a separate, later task. This just tracks selection and calls
// back, the seam that task hooks into.
export default function SetterCard({
  lead,
  stageColor,
  stageNeedsDialing,
  now,
  selected,
  locked,
  dialChecks,
  appointment,
  onSelect,
}: Props) {
  const rail = cardRail(lead, stageNeedsDialing, now);
  const ticked = dialChecks?.filter(Boolean).length ?? 0;
  // Speed to lead: only meaningful in a needs-dialing stage, and only until
  // the first dial (logged attempts OR a session tick, so the chip drops the
  // moment the setter starts working the lead, not minutes later when the
  // outcome write lands).
  const stl = stageNeedsDialing
    ? speedToLead(lead.createdAt, now, lead.attempts > 0 || ticked > 0)
    : null;
  // No-answer chain: count up from stage entry (opportunity updatedAt; the
  // automation's move is what last touched it), flipping to "redial due" at
  // 24 hours, the chain's callback rhythm.
  const wait = isNoAnswerStage(lead.stageName)
    ? noAnswerWait(lead.updatedAt ?? lead.createdAt, now)
    : null;
  const apptState = appointment ? confirmState(appointment, now) : null;
  // The manual-confirm alert belongs to a lead whose booking nobody has
  // confirmed. Confirmation is a TAG now, not a separate stage, so a confirmed
  // lead's chip is plain information while an unconfirmed one inside 24 hours
  // is a call to make.
  const confirmDue = apptState === "due" && isAwaitingConfirm(lead.stageName, lead.tags);
  // Null (the roster did not hold this contact) and "nothing blocked" both
  // produce no label, so the card never claims a lead is reachable.
  const dndLabel = dndBadgeLabel(lead.dnd);

  // Composed by hand rather than via Tailwind box-shadow utility classes,
  // because the rail and the selection ring can both be present at once and
  // only the last box-shadow class wins when two are applied via className.
  // The rail is always the stage's own color (urgency lives in the chips:
  // speed-to-lead, Waiting, the dial bar), so a card reads as part of its
  // column at a glance.
  const shadows: string[] = [`inset 3px 0 0 ${stageColor}`];
  if (selected) shadows.push("0 0 0 2px var(--brand)");
  const style = { boxShadow: shadows.join(", ") };

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      disabled={locked}
      style={style}
      className={
        "relative w-full overflow-hidden rounded-xl border bg-surface p-3 text-left transition-colors " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 " +
        (selected ? "border-brand " : "border-border ") +
        (locked ? "cursor-not-allowed opacity-50" : "")
      }
    >
      {locked && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" aria-hidden />
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-warning">
            Automation running
          </span>
        </div>
      )}
      <div className="truncate font-display text-[13.5px] font-semibold text-text">{lead.name}</div>
      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-faint">
        {lead.city && (
          <>
            <span className="font-data truncate">{lead.city}</span>
            <span className="opacity-50">·</span>
          </>
        )}
        <span className="font-data shrink-0">{timeAgo(lead.createdAt, now)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1" aria-label={`${ticked} of ${DIAL_SEGMENTS} dials ticked`}>
        {Array.from({ length: DIAL_SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={
              "h-1 w-5 rounded-full " + (dialChecks?.[i] ? "bg-brand" : "bg-surface-3")
            }
            aria-hidden
          />
        ))}
        <span className="font-data ml-0.5 text-[10px] font-semibold text-faint">
          {ticked}/{DIAL_SEGMENTS}
        </span>
      </div>
      {appointment && (
        <div
          className={
            "mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold " +
            (confirmDue
              ? "text-danger"
              : apptState === "passed"
                ? "text-faint"
                : "text-muted")
          }
        >
          <CalendarClock size={12} className="shrink-0" aria-hidden />
          <span className="font-data truncate">
            {apptState === "passed" ? "Appt passed · " : "Appt · "}
            {formatApptTime(appointment.startMs)}
          </span>
        </div>
      )}
      {confirmDue && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-danger-tint px-2 py-1">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-danger">
            Confirm manually
          </span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* First in the row on purpose. "Do not reach them this way" outranks
            "reach them fast": a setter who acts on the speed chip and ignores
            this one works a lead through a channel that cannot deliver. */}
        {dndLabel && (
          <span
            className="flex items-center gap-1 rounded-full bg-danger-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-danger"
            title={
              lead.dnd?.all
                ? "This contact is on Do Not Disturb in the CRM."
                : `Switched off in the CRM: ${lead.dnd?.channels.join(", ")}`
            }
          >
            <BellOff size={11} aria-hidden />
            {dndLabel}
          </span>
        )}
        {stl && (
          <span
            className={
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
              (stl.tone === "positive"
                ? "bg-positive-tint text-positive"
                : stl.tone === "warning"
                  ? "bg-warning-tint text-warning"
                  : "bg-danger-tint text-danger")
            }
            title="Time since this lead landed, waiting on its first dial"
          >
            <Timer size={11} aria-hidden />
            {stl.label}
          </span>
        )}
        {wait && (
          <span
            className={
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
              (wait.due ? "bg-danger-tint text-danger" : "bg-surface-3 text-muted")
            }
            title={
              wait.due
                ? "24 hours are up, this lead is due for its re-dial"
                : "Time in this No Answer stage; re-dial when it reaches 24h"
            }
          >
            <Hourglass size={11} aria-hidden />
            {wait.due ? `Redial due · ${wait.label}` : wait.label}
          </span>
        )}
        {lead.attempts > 0 && (
          <span className="font-data rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
            {lead.attempts} {lead.attempts === 1 ? "dial" : "dials"}
          </span>
        )}
        {rail === "warning" && (
          <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-warning">
            {staleWaitingLabel(lead.createdAt, now)}
          </span>
        )}
        {lead.contacted && (
          <span className="rounded-full bg-positive-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-positive">
            Spoke
          </span>
        )}
        {lead.lastOutcome && (
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted">
            {formatOutcome(lead.lastOutcome)}
          </span>
        )}
      </div>
    </button>
  );
}
