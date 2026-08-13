import { useMemo, useState } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import LeadTrackerTable from "../../components/ads/tracker/LeadTrackerTable";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsTrackerQuery, useMarkLead } from "../../hooks/useApi";
import type { AdTrackerRange, LeadTrackerLead } from "../../lib/api";
import type { LeadMarking } from "../../components/ads/tracker/LeadTrackerTable";
import {
  DEFAULT_RANGE,
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
  const [range, setRange] = useState<AdTrackerRange>(DEFAULT_RANGE);
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

  // Businesses that work their own leads mark them here; for everyone else the
  // status follows the pipeline and the table stays read-only. The server
  // decides which, per tenant, and says so on the payload.
  const mark = useMarkLead();
  const marking: LeadMarking | undefined =
    data?.statusMode === "manual" && !usingSample
      ? {
          onStatus: (contactId, status) => mark.mutate({ contactId, status }),
          onJobValue: (contactId, jobValue) => mark.mutate({ contactId, jobValue }),
        }
      : undefined;

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
            marking={marking}
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
