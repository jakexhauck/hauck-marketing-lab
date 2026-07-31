import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { PAID_ADS_CONTAINER } from "./shared";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { formatMoneyExact } from "../../lib/formatMoney";
import { useAuth } from "../../context/AuthContext";
import { useAdsMetaDataQuery } from "../../hooks/useApi";
import { ErrorNote, Spinner } from "./trackerShared";

// Paid Ads > Meta Data. The sheet's META DATA tab: the raw daily, per-ad
// snapshot exactly as Meta reported it. CTR, CPM and the weekday are derived
// here (the sheet recomputed them too) rather than stored.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

function ctr(clicks: number, impressions: number): string {
  return impressions ? `${((clicks / impressions) * 100).toFixed(2)}%` : "-";
}

function cpm(spend: number, impressions: number): string {
  return impressions ? formatMoneyExact((spend / impressions) * 1000) : "-";
}

function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdsMetaData() {
  const { session } = useAuth();
  const query = useAdsMetaDataQuery(Boolean(session));
  const rows = query.data?.rows ?? [];

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          count={rows.length ? `${rows.length} rows` : undefined}
        />

        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !query.data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
            No ad data has been pulled in yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1100px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-faint">
                  <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Day</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Spend</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Impressions</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Reach</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Link Clicks</th>
                  <th className="px-3 py-2.5 text-right font-semibold">CTR</th>
                  <th className="px-3 py-2.5 text-right font-semibold">CPM</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Campaign</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Ad Set</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Ad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.date}-${r.adId}-${i}`}
                    className="border-b border-border/60 last:border-b-0 hover:bg-surface"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-text tnum">{displayDate(r.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-faint">{weekday(r.date)}</td>
                    <td className="px-3 py-2.5 text-right text-text tnum">{formatMoneyExact(r.spend)}</td>
                    <td className="px-3 py-2.5 text-right text-text tnum">{r.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-text tnum">{r.reach.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-text tnum">{r.linkClicks.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-text tnum">{ctr(r.linkClicks, r.impressions)}</td>
                    <td className="px-3 py-2.5 text-right text-text tnum">{cpm(r.spend, r.impressions)}</td>
                    <td
                      className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 text-text"
                      title={r.campaignName}
                    >
                      {r.campaignName || "-"}
                    </td>
                    <td
                      className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 text-text"
                      title={r.adsetName}
                    >
                      {r.adsetName || "-"}
                    </td>
                    <td
                      className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 text-text"
                      title={r.adName}
                    >
                      {r.adName || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
