import { useState } from "react";
import { FlaskConical } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Segmented, type SegmentOption } from "../ui";
import { MetricBand, type MetricCell } from "./MetricBand";
import { DeliveryTrend } from "./DeliveryTrend";
import { AdFunnel } from "./AdFunnel";
import { CampaignsTable } from "./CampaignsTable";
import { useAdsData } from "../../hooks/useAds";
import {
  cpc,
  cpl,
  cpm,
  ctr,
  delta,
  roas,
  type AdMetrics,
  type AdsRange,
} from "../../lib/adsData";
import {
  formatCompact,
  formatMoney,
  formatMultiple,
  formatNumber,
  formatPercent,
} from "../../lib/format";

// The Atelier desktop Paid Ads surface (lg+). The phone keeps its own layout
// below lg; this renders only inside `hidden lg:flex` from the Paid Ads route.
// Same real data and ads components as the phone screen, restyled onto the
// shared command-deck chrome. Gold is reserved strictly for money values, per
// the Ledger Rule.

const RANGE_OPTIONS: SegmentOption<AdsRange>[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

// The headline efficiency band: the six figures a media buyer reads first.
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

// One bordered surface panel: a calm header (mono kicker + title), with the
// chart or table beneath. Mirrors the section pattern on Home and Billing.
function PanelCard({
  kicker,
  title,
  action,
  children,
  className,
}: {
  kicker: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] " +
        (className ?? "")
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-divider px-6 py-4">
        <div className="min-w-0">
          <div className="label-cap text-brand-text">{kicker}</div>
          <h2 className="mt-1 font-display text-[16px] font-semibold text-text">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function PaidAdsDesktop() {
  const [range, setRange] = useState<AdsRange>("30d");
  const data = useAdsData(range);

  return (
    <DesktopPage
      title="Paid Ads"
      actions={
        <>
          <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
        </>
      }
    >
      {data.demo && (
        <div className="mb-6 flex items-center gap-2 rounded-[var(--radius-lg)] border border-warning/30 bg-warning-tint px-4 py-2.5 text-[13px] text-warning">
          <FlaskConical size={15} className="shrink-0" />
          <span>
            Sample data. No ad account is connected yet, these figures are
            illustrative until a live source is wired in.
          </span>
        </div>
      )}

      {/* Headline efficiency, then delivery. Deltas compare against the
          previous comparable window. */}
      <div className="flex flex-col gap-3">
        <MetricBand cells={resultCells(data.totals, data.previous)} cols={6} />
        <MetricBand cells={deliveryCells(data.totals, data.previous)} cols={6} />
      </div>

      {/* Delivery tape (signature) + acquisition funnel. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <PanelCard kicker="Daily delivery" title="Spend vs leads">
          <DeliveryTrend daily={data.daily} />
        </PanelCard>

        <PanelCard kicker="Acquisition" title="Funnel">
          <AdFunnel m={data.totals} />
        </PanelCard>
      </div>

      {/* Per-campaign breakdown. The table owns its own bordered surface. */}
      <section className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-cap text-brand-text">By campaign</div>
            <h2 className="mt-1 font-display text-[16px] font-semibold text-text">
              Campaigns
            </h2>
          </div>
          <span className="label-cap">{data.campaigns.length} total</span>
        </div>
        <CampaignsTable campaigns={data.campaigns} />
      </section>
    </DesktopPage>
  );
}
