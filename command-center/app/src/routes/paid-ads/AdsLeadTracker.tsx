import { useMemo, useState } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import LeadTrackerTable from "../../components/ads/tracker/LeadTrackerTable";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsTrackerQuery } from "../../hooks/useApi";
import type { AdTrackerRange, LeadTrackerLead } from "../../lib/api";
import {
  ErrorNote,
  LeadSearch,
  RANGES,
  Segmented,
  Spinner,
  filterLeads,
} from "./trackerShared";
import { SAMPLE_LEADS } from "./sampleLeads";

// Paid Ads > Lead Tracker. The sheet's Lead Tracker tab.
//
// The table itself lives in components/ads/tracker/LeadTrackerTable.tsx, which
// the admin cockpit renders too. This file is the client's host for it.

export default function AdsLeadTracker() {
  const { session } = useAuth();
  const [range, setRange] = useState<AdTrackerRange>("all");
  const [search, setSearch] = useState("");
  // Level is irrelevant to the lead list; keep it at the cheap default.
  const query = useAdsTrackerQuery(range, "ad", Boolean(session));

  const realLeads: LeadTrackerLead[] = useMemo(() => query.data?.leads ?? [], [query.data]);
  // Fall back to a clearly-badged sample set when there are no real leads yet,
  // so the page can be judged with data in it. DEV/localhost only: a real client
  // in production must never see fabricated leads (the golden rule). Vanishes the
  // moment real leads flow, and is never mixed with real leads.
  const usingSample =
    import.meta.env.DEV && !query.isLoading && !query.isError && realLeads.length === 0;
  const leads = usingSample ? SAMPLE_LEADS : realLeads;

  const visible = useMemo(() => filterLeads(leads, search), [leads, search]);
  const data = query.data;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={[]}
          section="Lead Tracker"
          actions={
            <Segmented options={RANGES} value={range} onChange={setRange} label="Date range" />
          }
          filters={<LeadSearch value={search} onChange={setSearch} />}
        />

        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !data ? (
          <Spinner />
        ) : (
          <LeadTrackerTable
            leads={visible}
            sampleNotice={usingSample}
            emptyLabel={
              search.trim() ? "No leads match your search." : "No leads in this range yet."
            }
          />
        )}
      </div>
    </Shell>
  );
}
