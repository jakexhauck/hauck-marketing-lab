import { cardRail, formatOutcome } from "../../../lib/setterModel";
import { timeAgo } from "../../../lib/timeAgo";
import type { ApiSetterLead } from "../../../lib/api";

interface Props {
  lead: ApiSetterLead;
  stageNeedsDialing: boolean;
  now: number;
  selected: boolean;
  onSelect: (lead: ApiSetterLead) => void;
}

// One board card. Deliberately does not open anything: the lead detail
// cockpit is a separate, later task. This just tracks selection and calls
// back, the seam that task hooks into.
export default function SetterCard({ lead, stageNeedsDialing, now, selected, onSelect }: Props) {
  const rail = cardRail(lead, stageNeedsDialing, now);

  // Composed by hand rather than via Tailwind box-shadow utility classes,
  // because the rail and the selection ring can both be present at once and
  // only the last box-shadow class wins when two are applied via className.
  const shadows: string[] = [];
  if (rail === "danger") shadows.push("inset 3px 0 0 var(--danger)");
  else if (rail === "warning") shadows.push("inset 3px 0 0 var(--warning)");
  if (selected) shadows.push("0 0 0 2px var(--brand)");
  const style = shadows.length ? { boxShadow: shadows.join(", ") } : undefined;

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      style={style}
      className={
        "relative w-full overflow-hidden rounded-xl border bg-surface p-3 text-left transition-colors " +
        (selected ? "border-brand" : "border-border")
      }
    >
      <div className="truncate font-display text-[13.5px] font-semibold text-text">{lead.name}</div>
      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-faint">
        <span className="font-data truncate">{lead.city || "City unknown"}</span>
        <span className="opacity-50">·</span>
        <span className="font-data shrink-0">{timeAgo(lead.createdAt, now)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.attempts > 0 ? (
          <span className="font-data rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
            {lead.attempts} {lead.attempts === 1 ? "dial" : "dials"}
          </span>
        ) : (
          <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-danger">
            Never dialed
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
