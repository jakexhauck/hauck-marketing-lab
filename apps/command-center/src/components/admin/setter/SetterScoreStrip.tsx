import { useState } from "react";
import { Timer } from "lucide-react";
import { useSetterScoreboardQuery } from "../../../hooks/useApi";
import { medianSpeedToLeadMs, formatStlDuration } from "../../../lib/setterModel";
import type { ApiSetterLead } from "../../../lib/api";

// The scoreboard strip above the pipeline board (the only scoreboard
// surface; the dedicated tab was retired in favor of it). Five numbers kept
// small enough to read in a glance mid-dial, with a Today / 7 days window
// toggle on the right. The endpoint returns both windows in one response,
// so flipping the toggle never refetches.
//
// Speed to lead is computed here, client-side, from the leads the board
// already holds (see medianSpeedToLeadMs for why the server cannot), using
// the viewer's local midnight as the day boundary. The other four come from
// the scoreboard endpoint, whose day boundary is the business timezone; for
// an internal surface staffed in that timezone the mismatch is noise.

interface Props {
  tenantId: string;
  leads: ApiSetterLead[];
  now: number;
}

type Window = "today" | "week";

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnightMs(now: number, daysBack: number): number {
  const d = new Date(now - daysBack * DAY_MS);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5">
      <span
        className={
          "font-display text-[15px] font-semibold leading-none " +
          (accent ? "text-brand-text" : "text-text")
        }
      >
        {value}
      </span>
      <span className="text-[9.5px] font-bold uppercase tracking-wide text-faint">{label}</span>
    </div>
  );
}

export default function SetterScoreStrip({ tenantId, leads, now }: Props) {
  const [window, setWindow] = useState<Window>("today");
  const scoreboardQuery = useSetterScoreboardQuery(tenantId);
  const metrics = scoreboardQuery.data?.[window];

  const stlSinceMs = window === "today" ? localMidnightMs(now, 0) : localMidnightMs(now, 6);
  const stlMs = medianSpeedToLeadMs(leads, stlSinceMs);
  const rate =
    metrics && metrics.bookRate !== null ? `${Math.round(metrics.bookRate * 100)}%` : "--";

  return (
    // Mobile: a column. The five numbers scroll as one row (never wrapping to a
    // ragged two-line block), and the window toggle sits below them, right
    // aligned. Desktop is unchanged: the stats wrapper is display:contents at lg
    // so each stat rejoins the single wrapping row exactly as before.
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-2 lg:px-4">
      <div className="no-scrollbar flex items-center gap-x-4 overflow-x-auto lg:contents">
        <span
          className="flex shrink-0 items-center gap-1.5"
          title="Median time from a lead landing to its first dial. Under 5 minutes is the standard a form lead deserves."
        >
          <Timer size={13} className="text-brand" aria-hidden />
          <Stat
            label="Speed to lead"
            value={stlMs === null ? "--" : formatStlDuration(stlMs)}
            accent
          />
        </span>
        <Stat label="Dials" value={String(metrics?.dials ?? "--")} />
        <Stat label="Reached" value={String(metrics?.reached ?? "--")} />
        <Stat label="Booked" value={String(metrics?.booked ?? "--")} />
        <Stat label="Book rate" value={rate} />
      </div>
      <div
        className="flex items-center gap-1 self-end lg:ml-auto lg:self-auto"
        role="group"
        aria-label="Scoreboard window"
      >
        {(
          [
            { value: "today", label: "Today" },
            { value: "week", label: "7 days" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setWindow(opt.value)}
            aria-pressed={window === opt.value}
            className={
              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors " +
              (window === opt.value
                ? "bg-brand-tint text-brand-text"
                : "text-faint hover:bg-surface-2 hover:text-muted")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
