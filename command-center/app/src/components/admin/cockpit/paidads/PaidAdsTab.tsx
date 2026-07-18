import DataLeadsPanel from "./DataLeadsPanel";
import CampaignsPanel from "./CampaignsPanel";
import AdTrackingPanel from "./AdTrackingPanel";
import AdLibraryPanel from "./AdLibraryPanel";

// Paid Ads service tab inside the Fulfillment cockpit
// (/admin/delivery/:tenantId?tab=paid-ads). Routes the four sub-tabs
// (Campaigns, Ad Library, Ad Tracking, Data & Leads) for one admin-supplied
// tenant. Mirrors webdesign/WebDesignTab.tsx: all four sub-tabs are real.
//
// Ad Tracking took the slot the Funnel placeholder held: there is still no
// funnel-step data worth showing, and the daily paid-ad tracker is real.

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
    case "ad-tracking":
      return <AdTrackingPanel tenantId={tenantId} />;
    case "ad-library":
      return <AdLibraryPanel tenantId={tenantId} />;
    default:
      return (
        <div className="pk-empty">We are still building this view.</div>
      );
  }
}
