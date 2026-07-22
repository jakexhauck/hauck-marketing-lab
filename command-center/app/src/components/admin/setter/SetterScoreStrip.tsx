import { Timer } from "lucide-react";
import { useSetterScoreboardQuery } from "../../../hooks/useApi";
import { medianSpeedToLeadMs, formatStlDuration } from "../../../lib/setterModel";
import type { ApiSetterLead } from "../../../lib/api";

// The always-visible scoreboard strip above the pipeline board: today's
// numbers, kept small so they read in a glance mid-dial. The full breakdown
// (and the week window) lives on the Scoreboard tab.
//
// Speed to lead is computed here, client-side, from the leads the board
// already holds (see medianSpeedToLeadMs for why the server cannot), using
// the viewer's local midnight as "today". The other four come from the
// scoreboard endpoint, whose day boundary is the business timezone; for an
// internal surface staffed in that timezone the mismatch is noise.

interface Props {
  tenantId: string;
  leads: ApiSetterLead[];
  now: number;
}

function localMidnightMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
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
  const scoreboardQuery = useSetterScoreboardQuery(tenantId);
  const today = scoreboardQuery.data?.today;

  const stlMs = medianSpeedToLeadMs(leads, localMidnightMs(now));
  const rate =
    today && today.bookRate !== null ? `${Math.round(today.bookRate * 100)}%` : "--";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface px-4 py-2.5">
      <span
        className="flex items-center gap-1.5"
        title="Median time from a lead landing to its first dial, today"
      >
        <Timer size={13} className="text-brand" aria-hidden />
        <Stat label="Speed to lead" value={stlMs === null ? "--" : formatStlDuration(stlMs)} accent />
      </span>
      <Stat label="Dials" value={String(today?.dials ?? "--")} />
      <Stat label="Reached" value={String(today?.reached ?? "--")} />
      <Stat label="Booked" value={String(today?.booked ?? "--")} />
      <Stat label="Book rate" value={rate} />
      <span className="ml-auto text-[9.5px] font-bold uppercase tracking-wide text-faint">
        Today
      </span>
    </div>
  );
}
