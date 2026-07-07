import SitePanel from "./SitePanel";
import PagesPanel from "./PagesPanel";
import AnalyticsPanel from "./AnalyticsPanel";

// Web Design service tab inside the Fulfillment cockpit
// (/admin/delivery/:tenantId?tab=web-design). Routes the four sub-tabs (Site,
// Pages, Change Requests, Analytics) for one admin-supplied tenant. Each panel
// loads that tenant's real website data through the admin-tenant endpoints under
// /api/admin/clients/:tenantId/website/*. Sub-tabs land one at a time; until a
// panel exists it renders an honest "building this view" empty, never filler.

export default function WebDesignTab({
  tenantId,
  activeSub,
}: {
  tenantId: string;
  activeSub: string;
}) {
  switch (activeSub) {
    case "site":
      return <SitePanel tenantId={tenantId} />;
    case "pages":
      return <PagesPanel tenantId={tenantId} />;
    case "analytics":
      return <AnalyticsPanel tenantId={tenantId} />;
    default:
      return (
        <div className="pk-empty">We are still building this view.</div>
      );
  }
}
