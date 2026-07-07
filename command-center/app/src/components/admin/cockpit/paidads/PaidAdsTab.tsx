import DataLeadsPanel from "./DataLeadsPanel";

// Paid Ads service tab inside the Fulfillment cockpit
// (/admin/delivery/:tenantId?tab=paid-ads). Routes the four sub-tabs
// (Campaigns, Ad Library, Funnel, Data & Leads) for one admin-supplied tenant.
// Mirrors webdesign/WebDesignTab.tsx: Data & Leads is the first real panel
// (Task 4); Campaigns and Ad Library land in Tasks 5-6; Funnel has no endpoint
// and stays an honest "building this view" placeholder.

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
    case "ad-library":
    case "funnel":
    default:
      return (
        <div className="pk-empty">We are still building this view.</div>
      );
  }
}
