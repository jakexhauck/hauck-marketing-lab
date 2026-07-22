import { Fragment } from "react";
import { Megaphone } from "lucide-react";
import { Panel, PanelHeader, EmptyState } from "../../../ui";
import { useAdminAdsInsightsQuery } from "../../../../hooks/useApi";
import type { AdItem } from "../../../../lib/adsInsights";

// Paid Ads > Campaigns. One client's real Meta campaign -> ad-set -> ad tree
// in the Fulfillment cockpit, built client-side by grouping the same flat
// ads[] list Data & Leads reads (GET /api/admin/clients/:tenantId/ads/insights,
// shared adsCore) by campaignName/adsetName. Meta not wired, or no ads this
// month -> an honest, specific empty state, never fabricated numbers. Read
// only: no publish/pause/edit actions live here.

const UNGROUPED_CAMPAIGN = "No campaign";
const UNGROUPED_ADSET = "No ad set";

interface AdSetGroup {
  name: string;
  ads: AdItem[];
}

interface CampaignGroup {
  name: string;
  adsets: AdSetGroup[];
  spend: number;
  leads: number;
}

// Group the flat ad list into campaign -> ad-set -> ads, preserving the
// existing active-first/leads-desc order buildAds already sorted the ads in.
// Ads missing a campaign/ad-set name (older cached payloads, or a Meta ad with
// no nested object) land in an honest "No campaign"/"No ad set" bucket rather
// than being dropped.
function groupAds(ads: AdItem[]): CampaignGroup[] {
  const campaigns = new Map<string, Map<string, AdItem[]>>();
  for (const ad of ads) {
    const campaignName = ad.campaignName?.trim() || UNGROUPED_CAMPAIGN;
    const adsetName = ad.adsetName?.trim() || UNGROUPED_ADSET;
    if (!campaigns.has(campaignName)) campaigns.set(campaignName, new Map());
    const adsets = campaigns.get(campaignName)!;
    if (!adsets.has(adsetName)) adsets.set(adsetName, []);
    adsets.get(adsetName)!.push(ad);
  }
  const out: CampaignGroup[] = [];
  for (const [name, adsets] of campaigns) {
    const adsetGroups: AdSetGroup[] = [...adsets.entries()].map(([adsetName, adsetAds]) => ({
      name: adsetName,
      ads: adsetAds,
    }));
    const allAds = adsetGroups.flatMap((g) => g.ads);
    out.push({
      name,
      adsets: adsetGroups,
      spend: allAds.reduce((s, a) => s + a.spend, 0),
      leads: allAds.reduce((s, a) => s + a.leads, 0),
    });
  }
  // Real campaigns first (by spend, highest first); "No campaign" last.
  return out.sort((a, b) => {
    if (a.name === UNGROUPED_CAMPAIGN) return 1;
    if (b.name === UNGROUPED_CAMPAIGN) return -1;
    return b.spend - a.spend;
  });
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        active ? "bg-positive-tint text-positive" : "bg-[var(--surface-2)] text-muted"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active ? "Active" : "Paused"}
    </span>
  );
}

export default function CampaignsPanel({ tenantId }: { tenantId: string }) {
  const insightsQuery = useAdminAdsInsightsQuery(tenantId);

  if (insightsQuery.isLoading) {
    return <div className="pk-empty">Loading campaigns...</div>;
  }
  if (insightsQuery.isError || !insightsQuery.data) {
    return <div className="pk-empty">Could not load this client's campaigns.</div>;
  }

  const insights = insightsQuery.data;

  if (!insights.configured) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Megaphone size={22} />}
          title="Meta is not connected for this client yet"
          description="Add the client's ad account in Config to see their campaign, ad set, and ad structure here."
        />
      </Panel>
    );
  }

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: insights.currency || "USD",
    maximumFractionDigits: 0,
  });

  if (insights.ads.length === 0) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Megaphone size={22} />}
          title="No ads have run this month"
          description="Once this client's ads start spending, their campaign, ad set, and ad structure will show up here."
        />
      </Panel>
    );
  }

  const campaigns = groupAds(insights.ads);

  return (
    <div className="flex flex-col gap-4">
      {campaigns.map((campaign) => (
        <Panel key={campaign.name} className="overflow-hidden p-0">
          <PanelHeader
            title={campaign.name}
            action={
              <span className="label-cap">
                {money.format(campaign.spend)} &middot; {campaign.leads.toLocaleString()} leads
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Ad", "Status", "Leads", "Reach", "Spend"].map((h) => (
                    <th
                      key={h}
                      className="label-cap whitespace-nowrap border-b border-divider bg-[var(--rail)] px-4 py-2.5 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaign.adsets.map((adset) => (
                  <Fragment key={adset.name}>
                    <tr className="border-b border-divider bg-[var(--rail)]/60">
                      <td colSpan={5} className="px-4 py-2 text-[12.5px] font-semibold text-muted">
                        {adset.name}
                      </td>
                    </tr>
                    {adset.ads.map((a) => (
                      <tr key={a.id} className="border-b border-divider last:border-0">
                        <td className="max-w-[280px] truncate px-4 py-3 pl-8 text-[13.5px] font-semibold text-text">
                          {a.headline}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill active={a.active} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] tnum text-muted">
                          {a.leads.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] tnum text-muted">
                          {a.reach.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold tnum text-text">
                          {money.format(a.spend)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}
