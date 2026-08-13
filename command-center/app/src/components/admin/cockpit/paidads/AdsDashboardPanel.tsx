import { useState } from "react";
import DashboardSheet from "../../../ads/tracker/DashboardSheet";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import { useAdminAdTrackerQuery, useAdsSyncMutation } from "../../../../hooks/useApi";
import type { AdTrackerLevel, AdTrackerRange } from "../../../../lib/api";

// Paid Ads > Dashboard, in the Fulfillment cockpit.
//
// The same sheet the client reads on their own /marketing/paid-ads, for the
// client in the picker. It renders components/ads/tracker/DashboardSheet.tsx
// verbatim, so an operator and a client discussing "the ROAS column" are
// looking at the same column.
//
// Replaced AdTrackerPanel.tsx, which showed these figures as rounded KPI cards
// under its own adt-* stylesheet: the same numbers drawn two ways, which is
// exactly the drift this removes.

// How old the spend snapshot is, said plainly. A dashboard that divides by a
// stale number does not look broken, it looks wrong-but-plausible, so this line
// is the difference between catching that and not.
//
// Operator-only, deliberately: the client's page carries no such line, and the
// Refresh button beneath it is not theirs to press.
function spendAge(lastSpendDate: string | null): { text: string; stale: boolean } {
  if (!lastSpendDate) return { text: "Spend has never been pulled in", stale: true };
  const today = new Date();
  const todayIso = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const [y, m, d] = lastSpendDate.split("-").map(Number);
  const last = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const days = Math.round((todayIso.getTime() - last) / 86_400_000);
  // One day behind is the healthy state: the cron runs overnight and Meta only
  // closes out a day after it ends. Two is a missed run.
  if (days <= 1) return { text: "Spend up to date", stale: false };
  return { text: `Spend is ${days} days behind`, stale: true };
}

export default function AdsDashboardPanel({ tenantId }: { tenantId: string }) {
  const [range, setRange] = useState<AdTrackerRange>("all");
  const [level, setLevel] = useState<AdTrackerLevel>("ad");

  const query = useAdminAdTrackerQuery(tenantId, range, level);
  const sync = useAdsSyncMutation();
  const data = query.data;

  if (query.isError) {
    return <ErrorNote message={(query.error as Error | null)?.message} />;
  }
  if (query.isLoading && !data) return <Spinner />;

  const age = spendAge(data!.meta.lastSpendDate);

  return (
    <div className="flex flex-col">
      {sync.isError && (
        <p className="mb-3 text-[12px] text-danger">
          Could not pull spend: {(sync.error as Error | null)?.message ?? "unknown error"}
        </p>
      )}

      <DashboardSheet
        data={data!}
        range={range}
        onRange={setRange}
        level={level}
        onLevel={setLevel}
        resultsRight={
          <span className="flex items-center gap-2.5 normal-case tracking-normal">
            <span
              className={
                age.stale ? "text-[11.5px] font-semibold text-warning" : "text-[11.5px] text-faint"
              }
            >
              {age.text}
            </span>
            <button
              type="button"
              onClick={() => sync.mutate(tenantId)}
              disabled={sync.isPending}
              className="rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-60"
            >
              {sync.isPending ? "Pulling..." : "Refresh spend"}
            </button>
          </span>
        }
      />

      {/* No unattributed line here: the sheet below prints its own, and the two
          said the same thing one under the other. */}
    </div>
  );
}
