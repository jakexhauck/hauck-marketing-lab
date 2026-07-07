import DataLeadsPanel from "./DataLeadsPanel";
import CampaignsPanel from "./CampaignsPanel";
import FunnelPanel from "./FunnelPanel";

// Paid Ads service tab inside the Fulfillment cockpit
// (/admin/delivery/:tenantId?tab=paid-ads). Routes the four sub-tabs
// (Campaigns, Ad Library, Funnel, Data & Leads) for one admin-supplied tenant.
// Mirrors webdesign/WebDesignTab.tsx: Data & Leads (Task 4), Campaigns +
// Funnel (Task 5) are real; Ad Library lands in Task 6 and stays an honest
// "building this view" placeholder.

export default function PaidAdsTab({
  tenantId,
  activeSub,
}: {
  tenantId: string;
  activeSub: string;
}) {
  switch (activeSub) {
    case "data-leads":
      return <DataLeadsPanel tenantId={tenantId} />;
    case "campaigns":
      return <CampaignsPanel tenantId={tenantId} />;
    case "funnel":
      return <FunnelPanel />;
    case "ad-library":
    default:
      return (
        <div className="pk-empty">We are still building this view.</div>
      );
  }
}
