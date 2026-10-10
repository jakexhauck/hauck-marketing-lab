import { LineChart } from "lucide-react";
import { Switch } from "../../ui/Switch";
import { useEstimateTrackingQuery, useSetEstimateTracking } from "../../../hooks/useApi";

// Is this client on the new Ads Dashboard (tenants.estimate_tracking, 0153)?
// On: leads, pickups, Home Estimate bookings and jobs. Off: the older
// dashboard. See functions/api/admin/clients/[tenantId]/estimate-tracking.ts.
//
// Heading plus the switch, nothing else (Jake's no-sub-text rule).

export default function EstimateTrackingCard({ tenantId }: { tenantId: string }) {
  const query = useEstimateTrackingQuery(tenantId);
  const set = useSetEstimateTracking(tenantId);
  const on = set.isPending ? set.variables === true : query.data?.on === true;

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="flex items-center gap-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
          aria-hidden
        >
          <LineChart size={16} />
        </span>
        <h2 className="flex-1 font-display text-[16.5px] font-semibold text-text">
          New Ads Dashboard
        </h2>
        {query.isError ? (
          <span className="text-[12.5px] font-medium text-danger">Did not load</span>
        ) : (
          <Switch
            checked={on}
            disabled={query.isLoading || set.isPending}
            onChange={(next) => set.mutate(next)}
            label="New Ads Dashboard"
          />
        )}
      </header>
      {set.isError && (
        <p className="mt-3 text-[12.5px] font-medium text-danger">
          {(set.error as Error).message || "That did not save."}
        </p>
      )}
    </section>
  );
}
