import { useState } from "react";
import { Timer } from "lucide-react";
import {
  useSetterScoreboardQuery,
  useSetterPipelinesQuery,
  useSetterLeadsQuery,
} from "../../../hooks/useApi";
import { useNow } from "../../../context/NowContext";
import { Segmented } from "../../ui";
import { medianSpeedToLeadMs, formatStlDuration } from "../../../lib/setterModel";

// The Scoreboard tab: the strip's numbers, large, with a Today / 7 days
// toggle. Same five metrics as the strip on purpose; a second vocabulary
// would just invite "which number is real".
//
// Speed to lead is computed from the Lead Form pipeline's current leads
// (the pipeline where speed is the job; see medianSpeedToLeadMs for why the
// server cannot compute it). Leads that have already left that pipeline drop
// out of the sample, so the week figure skews toward still-active leads;
// honest enough for a coaching number, revisit if a stamped column ever
// lands on setter_dials.

interface Props {
  tenantId: string;
  clientName: string;
}

type Window = "today" | "week";

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnightMs(now: number, daysBack: number): number {
  const d = new Date(now - daysBack * DAY_MS);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4" title={hint}>
      <div className="font-display text-[26px] font-semibold leading-none text-text">{value}</div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

export default function SetterScoreboard({ tenantId, clientName }: Props) {
  const now = useNow();
  const [window, setWindow] = useState<Window>("today");

  const scoreboardQuery = useSetterScoreboardQuery(tenantId);
  const metrics = scoreboardQuery.data?.[window];

  const pipelinesQuery = useSetterPipelinesQuery(tenantId);
  const leadFormPipeline =
    (pipelinesQuery.data?.pipelines ?? []).find((p) => /lead form/i.test(p.name)) ?? null;
  const leadsQuery = useSetterLeadsQuery(tenantId, leadFormPipeline?.id ?? "", !!leadFormPipeline);
  const stlSinceMs = window === "today" ? localMidnightMs(now, 0) : localMidnightMs(now, 6);
  const stlMs = medianSpeedToLeadMs(leadsQuery.data?.leads ?? [], stlSinceMs);

  if (scoreboardQuery.isLoading) return <div className="pk-empty">Loading scoreboard...</div>;
  if (scoreboardQuery.isError) {
    return <div className="pk-empty">Could not load the scoreboard for {clientName}.</div>;
  }

  const rate =
    metrics && metrics.bookRate !== null ? `${Math.round(metrics.bookRate * 100)}%` : "--";

  return (
    <div className="space-y-4">
      <Segmented
        options={[
          { value: "today", label: "Today" },
          { value: "week", label: "7 days" },
        ]}
        value={window}
        onChange={(v) => setWindow(v as Window)}
        size="sm"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface p-4"
          title="Median time from a lead landing to its first dial. Under 5 minutes is the standard a form lead deserves."
        >
          <div className="flex items-center gap-2 font-display text-[26px] font-semibold leading-none text-brand-text">
            <Timer size={20} aria-hidden />
            {stlMs === null ? "--" : formatStlDuration(stlMs)}
          </div>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-faint">
            Speed to lead
          </div>
        </div>
        <Tile label="Dials" value={String(metrics?.dials ?? 0)} hint="Every dial logged in the window" />
        <Tile
          label="Leads reached"
          value={String(metrics?.reached ?? 0)}
          hint="Unique leads somebody actually spoke to"
        />
        <Tile
          label="Appts booked"
          value={String(metrics?.booked ?? 0)}
          hint="Unique leads whose dial outcome was Booked"
        />
        <Tile
          label="Book rate"
          value={rate}
          hint="Booked over reached. Blank until somebody is reached."
        />
      </div>

      <p className="text-[11.5px] text-faint">
        Derived live from logged dials. Speed to lead reads from the Lead Form pipeline's current
        leads.
      </p>
    </div>
  );
}
