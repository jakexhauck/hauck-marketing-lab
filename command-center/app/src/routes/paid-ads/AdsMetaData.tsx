import { useMemo } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import MetaDataTable from "../../components/ads/tracker/MetaDataTable";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsMetaDataQuery, useAdsStatusQuery } from "../../hooks/useApi";
import AdsComingSoon from "../../components/ads/AdsComingSoon";
import { groupMetaDaysByDate } from "../../lib/metaDays";
import { ErrorNote, Spinner } from "./trackerShared";

// Paid Ads > Meta Data. The sheet's META DATA tab, rolled up.
//
// The sheet itself lives in components/ads/tracker/MetaDataTable.tsx, which the
// admin cockpit renders too. This file is the client's host for it.

export default function AdsMetaData() {
  const { session } = useAuth();
  const status = useAdsStatusQuery(Boolean(session));
  const launched = status.data?.launched === true;
  const query = useAdsMetaDataQuery(Boolean(session) && launched);
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const days = useMemo(() => groupMetaDaysByDate(rows), [rows]);

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={[]}
          section="Meta Data"
          count={
            days.length
              ? `${days.length} ${days.length === 1 ? "day" : "days"}, ${rows.length} ad ${rows.length === 1 ? "row" : "rows"}`
              : undefined
          }
        />

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
        ) : query.isLoading && !query.data ? (
          <Spinner />
        ) : (
          // Inset from the page gutter so the table reads as an object on the
          // page rather than running edge to edge.
          <MetaDataTable rows={rows} inset />
        )}
      </div>
    </Shell>
  );
}
