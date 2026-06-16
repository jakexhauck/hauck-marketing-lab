import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Panel, PanelHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DeliveryTrend } from "@/components/ads/DeliveryTrend";
import { useAdsData } from "@/hooks/useAds";
import { cpl, roas } from "@/lib/adsData";
import { formatMoney, formatMultiple, formatNumber } from "@/lib/format";

function Mini({ label, value, tone }: { label: string; value: ReactNode; tone?: "ledger" | "data" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-cap">{label}</span>
      <span className={cn("text-[20px] leading-none", tone === "ledger" ? "ledger" : "font-data text-text tnum")}>
        {value}
      </span>
    </div>
  );
}

// The paid-acquisition pulse on the business dashboard: the four figures that
// say whether the ad spend is working, plus the delivery tape, with a jump into
// the full Paid Ads surface. Reads from the same source as that surface.
export function AdsSnapshot() {
  const data = useAdsData("30d");
  const t = data.totals;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        kicker="Paid acquisition"
        title={`${data.account.platform} · last 30 days`}
        action={
          <Link
            to="/paid-ads"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-text transition-colors hover:text-brand"
          >
            Open Paid Ads
            <ArrowUpRight size={14} aria-hidden />
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-center">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Mini label="Spend" value={formatMoney(t.spend)} tone="ledger" />
          <Mini label="Leads" value={formatNumber(t.leads)} />
          <Mini label="Cost / lead" value={formatMoney(cpl(t), { cents: true })} tone="ledger" />
          <Mini label="ROAS" value={formatMultiple(roas(t))} />
        </div>
        <div className="min-w-0">
          <DeliveryTrend daily={data.daily} />
        </div>
      </div>
    </Panel>
  );
}
