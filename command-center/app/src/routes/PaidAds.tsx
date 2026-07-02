import { useState } from "react";
import { FlaskConical } from "lucide-react";
import Shell from "../components/Shell";
import { PageHeader } from "../components/PageHeader";
import { Panel, PanelHeader, Segmented, type SegmentOption } from "../components/ui";
import { MetricBand, type MetricCell } from "../components/ads/MetricBand";
import { DeliveryTrend } from "../components/ads/DeliveryTrend";
import { AdFunnel } from "../components/ads/AdFunnel";
import { CampaignsTable } from "../components/ads/CampaignsTable";
import PaidAdsDesktop from "../components/ads/PaidAdsDesktop";
import { useAdsData } from "../hooks/useAds";
import {
  RANGE_LABEL,
  cpc,
  cpl,
  cpm,
  ctr,
  delta,
  roas,
  type AdMetrics,
  type AdsRange,
} from "../lib/adsData";
import {
  formatCompact,
  formatMoney,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "../lib/format";

const RANGE_OPTIONS: SegmentOption<AdsRange>[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

// Build the headline efficiency band: the six figures a media buyer reads first.
function resultCells(t: AdMetrics, p: AdMetrics): MetricCell[] {
  return [
    { label: "Spend", value: formatMoney(t.spend), tone: "ledger", delta: delta(t.spend, p.spend), goodDirection: "neutral" },
    { label: "Leads", value: formatNumber(t.leads), delta: delta(t.leads, p.leads), goodDirection: "up" },
    {
      label: "Cost / lead",
      value: formatMoney(cpl(t), { cents: true }),
      tone: "ledger",
      delta: delta(cpl(t) ?? 0, cpl(p) ?? 0),
      goodDirection: "down",
    },
    {
      label: "ROAS",
      value: formatMultiple(roas(t)),
      delta: delta(roas(t) ?? 0, roas(p) ?? 0),
      goodDirection: "up",
      caption: "revenue / spend",
    },
    { label: "Revenue", value: formatMoney(t.revenue), tone: "ledger", delta: delta(t.revenue, p.revenue), goodDirection: "up" },
    { label: "Customers", value: formatNumber(t.customers), delta: delta(t.customers, p.customers), goodDirection: "up" },
  ];
}

// The delivery band: reach and efficiency of the buy itself.
function deliveryCells(t: AdMetrics, p: AdMetrics): MetricCell[] {
  return [
    { label: "Impressions", value: formatCompact(t.impressions), delta: delta(t.impressions, p.impressions), goodDirection: "up" },
    { label: "Reach", value: formatCompact(t.reach), delta: delta(t.reach, p.reach), goodDirection: "up" },
    { label: "Clicks", value: formatNumber(t.clicks), delta: delta(t.clicks, p.clicks), goodDirection: "up" },
    { label: "CTR", value: formatPercent(ctr(t)), delta: delta(ctr(t) ?? 0, ctr(p) ?? 0), goodDirection: "up" },
    {
      label: "CPC",
      value: formatMoney(cpc(t), { cents: true }),
      tone: "ledger",
      delta: delta(cpc(t) ?? 0, cpc(p) ?? 0),
      goodDirection: "down",
    },
    {
      label: "CPM",
      value: formatMoney(cpm(t), { cents: true }),
      tone: "ledger",
      delta: delta(cpm(t) ?? 0, cpm(p) ?? 0),
      goodDirection: "down",
    },
  ];
}

export function PaidAds() {
  const [range, setRange] = useState<AdsRange>("30d");
  const data = useAdsData(range);

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders
          PaidAdsDesktop instead; both share the same ads dataset. */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-8 pt-5 lg:hidden">
      <PageHeader
        title="Paid Ads"
        count={`${data.campaigns.length} campaigns`}
        description={`${data.account.platform} · ${data.account.name} · ${RANGE_LABEL[range]}`}
        actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />}
      />

      {data.demo && (
        <div className="mb-5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-warning-tint/40 px-3.5 py-2 text-[12.5px] text-warning">
          <FlaskConical size={15} className="shrink-0" />
          <span>
            Sample data. No ad account is connected yet, these figures are illustrative until a
            live source is wired in.
          </span>
        </div>
      )}

      {/* Headline efficiency. Deltas compare against the previous comparable window. */}
      <div className="mb-3">
        <MetricBand cells={resultCells(data.totals, data.previous)} cols={6} />
      </div>
      <div className="mb-5">
        <MetricBand cells={deliveryCells(data.totals, data.previous)} cols={6} />
      </div>

      {/* Delivery tape (signature) + acquisition funnel. */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Panel className="overflow-hidden">
          <PanelHeader kicker="Daily delivery" title="Spend vs leads" />
          <div className="p-4 sm:p-5">
            <DeliveryTrend daily={data.daily} />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader kicker="Acquisition" title="Funnel" />
          <div className="p-4 sm:p-5">
            <AdFunnel m={data.totals} />
          </div>
        </Panel>
      </div>

      {/* Per-campaign breakdown. */}
      <Panel className="overflow-hidden">
        <PanelHeader
          kicker="By campaign"
          title="Campaigns"
          action={<span className="label-cap">Sortable</span>}
        />
        <div className="p-3 sm:p-4">
          <CampaignsTable campaigns={data.campaigns} />
        </div>
      </Panel>
      </div>

      {/* Desktop client app (lg+): the Atelier ads command deck. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <PaidAdsDesktop />
      </div>
    </Shell>
  );
}
