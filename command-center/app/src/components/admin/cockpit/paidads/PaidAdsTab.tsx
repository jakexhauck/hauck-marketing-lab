import DataLeadsPanel from "./DataLeadsPanel";
import CampaignsPanel from "./CampaignsPanel";
import FunnelPanel from "./FunnelPanel";
import AdLibraryPanel from "./AdLibraryPanel";

// Paid Ads service tab inside the Fulfillment cockpit
// (/admin/delivery/:tenantId?tab=paid-ads). Routes the four sub-tabs
// (Campaigns, Ad Library, Funnel, Data & Leads) for one admin-supplied tenant.
// Mirrors webdesign/WebDesignTab.tsx: all four sub-tabs are now real.

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
      return <AdLibraryPanel tenantId={tenantId} />;
    default:
      return (
        <div className="pk-empty">We are still building this view.</div>
      );
  }
}
