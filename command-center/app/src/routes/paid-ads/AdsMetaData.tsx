import { useMemo } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import MetaDataTable from "../../components/ads/tracker/MetaDataTable";
import { PAID_ADS_CONTAINER } from "./shared";
import { useAuth } from "../../context/AuthContext";
import { useAdsMetaDataQuery } from "../../hooks/useApi";
import { groupMetaDaysByDate } from "../../lib/metaDays";
import { ErrorNote, Spinner } from "./trackerShared";

// Paid Ads > Meta Data. The sheet's META DATA tab, rolled up.
//
// The sheet itself lives in components/ads/tracker/MetaDataTable.tsx, which the
// admin cockpit renders too. This file is the client's host for it.

export default function AdsMetaData() {
  const { session } = useAuth();
  const query = useAdsMetaDataQuery(Boolean(session));
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

        {query.isError ? (
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
