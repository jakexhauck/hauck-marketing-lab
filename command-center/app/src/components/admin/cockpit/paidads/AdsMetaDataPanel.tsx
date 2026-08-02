import { useMemo } from "react";
import MetaDataTable from "../../../ads/tracker/MetaDataTable";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import { useAdminAdsMetaDataQuery } from "../../../../hooks/useApi";
import { groupMetaDaysByDate } from "../../../../lib/metaDays";

// Paid Ads > Meta Data, in the Fulfillment cockpit.
//
// The same daily snapshot sheet the client reads, for the client in the picker.
// New to the cockpit: the admin side had no equivalent of this tab at all, so
// checking a client's raw Meta days meant entering their live app.
//
// Not inset, unlike the client page: the cockpit section already pads its body,
// and a second inset would float the table oddly inside it.

export default function AdsMetaDataPanel({ tenantId }: { tenantId: string }) {
  const query = useAdminAdsMetaDataQuery(tenantId);
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const days = useMemo(() => groupMetaDaysByDate(rows), [rows]);

  if (query.isError) {
    return <ErrorNote message={(query.error as Error | null)?.message} />;
  }
  if (query.isLoading && !query.data) return <Spinner />;

  return (
    <div className="flex flex-col">
      {days.length > 0 && (
        <p className="mb-3 text-[12px] text-faint">
          {days.length} {days.length === 1 ? "day" : "days"}, {rows.length} ad{" "}
          {rows.length === 1 ? "row" : "rows"}
        </p>
      )}
      <MetaDataTable rows={rows} />
    </div>
  );
}
