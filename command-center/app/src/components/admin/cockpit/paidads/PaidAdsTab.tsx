import AdsDashboardPanel from "./AdsDashboardPanel";
import AdsLeadTrackerPanel from "./AdsLeadTrackerPanel";
import AdsMetaDataPanel from "./AdsMetaDataPanel";
import CreativesPanel from "./CreativesPanel";

// Paid Ads service tab inside the Fulfillment cockpit
// (/admin/fulfillment/paid-ads). Routes the four sub-tabs for the client in the
// picker.
//
// All four are the client's OWN Paid Ads pages, rendered for a named tenant:
// Dashboard, Lead Tracker, Meta Data and Creatives all mount the same components
// as /marketing/paid-ads. The operator and the client read one set of pages.
//
// This replaced Campaigns, Ad Library, Ad Tracking and Data & Leads. Ad Tracking
// and Data & Leads were the same numbers as the client's Dashboard and Lead
// Tracker drawn a second way, and Campaigns was a tree the Breakdown's "View by:
// Campaign" already covers. Ad Library became Creatives: it tried to mirror the
// Meta media library and hold a hand-typed creatives tracker, when the creatives
// have always lived in Drive. Creatives points at that folder instead, and is
// the one tab that carries an operator-only control (setting the folder).

export default function PaidAdsTab({
  tenantId,
  activeSub,
}: {
  tenantId: string;
  activeSub: string;
}) {
  switch (activeSub) {
    case "dashboard":
      return <AdsDashboardPanel tenantId={tenantId} />;
    case "leads":
      return <AdsLeadTrackerPanel tenantId={tenantId} />;
    case "meta-data":
      return <AdsMetaDataPanel tenantId={tenantId} />;
    case "creatives":
      return <CreativesPanel tenantId={tenantId} />;
    default:
      return <div className="pk-empty">We are still building this view.</div>;
  }
}
