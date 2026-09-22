import { useState } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import DashboardSheet from "../../components/ads/tracker/DashboardSheet";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsStatusQuery, useAdsTrackerQuery } from "../../hooks/useApi";
import AdsComingSoon from "../../components/ads/AdsComingSoon";
import type { AdTrackerLevel, AdTrackerRange } from "../../lib/api";
import { DEFAULT_RANGE, ErrorNote, Spinner } from "./trackerShared";

// Paid Ads > Dashboard. The client tracking sheet's Dashboard tab.
//
// The sheet itself lives in components/ads/tracker/DashboardSheet.tsx, which
// the admin cockpit renders too. This file is the client's host for it: the
// session's data, the app shell, and the page bar.

export default function AdsDashboard() {
  const { session } = useAuth();
  const [range, setRange] = useState<AdTrackerRange>(DEFAULT_RANGE);
  const [level, setLevel] = useState<AdTrackerLevel>("ad");

  // Status first: it gates the page on launch and re-syncs stale spend before
  // the tracker below reads it. Nothing is fetched for a client not launched.
  const status = useAdsStatusQuery(Boolean(session));
  const launched = status.data?.launched === true;
  const query = useAdsTrackerQuery(range, level, Boolean(session) && launched);
  const data = query.data;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar tabs={[]} section="Ads Dashboard" />

        {status.isError ? (
          <ErrorNote message={(status.error as Error | null)?.message} />
        ) : !status.data ? (
          // No answer yet, not "not launched". Offline with nothing saved, the
          // query sits paused with isLoading false, and reading that as
          // launched=false told a live client their ads had not launched.
          <Spinner />
        ) : !launched ? (
          <AdsComingSoon />
        ) : query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !data ? (
          <Spinner />
        ) : (
          <DashboardSheet
            data={data!}
            range={range}
            onRange={setRange}
            level={level}
            onLevel={setLevel}
          />
        )}
      </div>
    </Shell>
  );
}
