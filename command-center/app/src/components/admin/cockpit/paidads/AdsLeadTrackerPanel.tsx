import { useMemo, useState } from "react";
import LeadTrackerTable from "../../../ads/tracker/LeadTrackerTable";
import {
  ErrorNote,
  LeadSearch,
  RANGES,
  Segmented,
  Spinner,
  filterLeads,
} from "../../../../routes/paid-ads/trackerShared";
import { useAdminAdTrackerQuery } from "../../../../hooks/useApi";
import type { AdTrackerRange, LeadTrackerLead } from "../../../../lib/api";

// Paid Ads > Lead Tracker, in the Fulfillment cockpit.
//
// The same table the client reads on their own Lead Tracker page, for the
// client in the picker.
//
// No sample-data fallback here, unlike the client page: an empty table is the
// honest answer, and an operator reading fabricated leads under a named
// client's heading is how a real decision gets made on invented numbers.

export default function AdsLeadTrackerPanel({ tenantId }: { tenantId: string }) {
  const [range, setRange] = useState<AdTrackerRange>("all");
  const [search, setSearch] = useState("");

  // Level is irrelevant to the lead list; keep it at the cheap default so this
  // shares a cache entry with nothing and re-fetches only on range.
  const query = useAdminAdTrackerQuery(tenantId, range, "ad");

  const leads: LeadTrackerLead[] = useMemo(() => query.data?.leads ?? [], [query.data]);
  const visible = useMemo(() => filterLeads(leads, search), [leads, search]);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <LeadSearch value={search} onChange={setSearch} />
        <Segmented options={RANGES} value={range} onChange={setRange} label="Date range" />
      </div>

      {query.isError ? (
        <ErrorNote message={(query.error as Error | null)?.message} />
      ) : query.isLoading && !query.data ? (
        <Spinner />
      ) : (
        <LeadTrackerTable
          leads={visible}
          emptyLabel={
            search.trim() ? "No leads match your search." : "No leads in this range yet."
          }
        />
      )}
    </div>
  );
}
