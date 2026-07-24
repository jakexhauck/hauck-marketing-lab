import Avatar from "../Avatar";
import { useNow } from "../../context/NowContext";
import type { ApiHandoff } from "../../lib/api";
import { statusMeta, isIgnored, isActive, lostReasonLabel } from "../../lib/handoffModel";
import { TONE_CHIP, TONE_SOLID } from "./tone";

// The queue of handed-off leads. In-play leads carry a coloured rail (red if the
// owner has left a fresh one sitting), closed ones read quietly below.

function whenLabel(iso: string | null, now: number): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusChip({ h, now }: { h: ApiHandoff; now: number }) {
  if (isIgnored(h, now)) {
    return (
      <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold " + TONE_CHIP.danger}>
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Needs attention
      </span>
    );
  }
  const meta = statusMeta(h.status);
  let label: string = meta.label;
  if ((h.status === "won" || h.status === "job_booked") && h.value)
    label = `${meta.label} · $${h.value.toLocaleString()}`;
  if (h.status === "lost" && h.lostReason) label = `Lost · ${lostReasonLabel(h.lostReason)}`;
  return (
    <span className={"rounded-full px-2 py-0.5 text-[10.5px] font-bold " + TONE_CHIP[meta.tone]}>
      {label}
    </span>
  );
}

export default function HandoffsList({
  items,
  selectedId,
  onOpen,
  emptyLabel = "No handoffs yet.",
}: {
  items: ApiHandoff[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  emptyLabel?: string;
}) {
  const now = useNow();

  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {items.map((h, i) => {
        const active = h.id === selectedId;
        const ignored = isIgnored(h, now);
        // A rail on in-play leads (not the parked "later"): red if ignored, else
        // the status colour.
        const showRail =
          isActive(h.status) && h.status !== "later";
        const railTone = ignored ? "danger" : statusMeta(h.status).tone;
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onOpen(h.id)}
              className={
                "relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors " +
                (active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]") +
                (i === items.length - 1 ? "" : " border-b border-[var(--divider)]")
              }
            >
              {showRail && (
                <span
                  className={"absolute inset-y-0 left-0 w-[3px] " + TONE_SOLID[railTone]}
                  aria-hidden="true"
                />
              )}
              <Avatar name={h.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-[14.5px] font-bold text-[var(--text)]">
                    {h.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-[var(--text-faint)]">
                    {whenLabel(h.handedAt, now)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">
                  Qualified by {h.setterName} · {h.phone}
                </div>
                <div className="mt-1.5">
                  <StatusChip h={h} now={now} />
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
