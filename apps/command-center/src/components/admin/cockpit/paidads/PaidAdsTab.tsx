import AdsDashboardPanel from "./AdsDashboardPanel";
import AdsLeadTrackerPanel from "./AdsLeadTrackerPanel";
import AdsMetaDataPanel from "./AdsMetaDataPanel";
import AdsSetupWizard from "./AdsSetupWizard";
import { ADS_SETUP_SUB } from "../../../../lib/fulfillmentPages";

// Paid Ads service tab inside the Fulfillment cockpit
// (/admin/fulfillment/paid-ads). Routes the sub-tabs for the client in the
// picker.
//
// Every sub-tab is one of the client's OWN Paid Ads pages, rendered for a named
// tenant: Dashboard, Lead Tracker and Meta Data mount the same components as
// /marketing/paid-ads. The operator and the client read one set of pages.
//
// This replaced Campaigns, Ad Library, Ad Tracking and Data & Leads. Ad Tracking
// and Data & Leads were the same numbers as the client's Dashboard and Lead
// Tracker drawn a second way, and Campaigns was a tree the Breakdown's "View by:
// Campaign" already covers. Creatives, Copy & Angles and Lead Form went
// 2026-10-27 (Jake).

export default function PaidAdsTab({
  tenantId,
  clientName,
  activeSub,
  adAccountId,
  onSelectSub,
}: {
  tenantId: string;
  // The setup wizard names the client while it looks for their ad account.
  clientName: string;
  activeSub: string;
  // The client's Meta ad account, or null while their ads are unwired. The tab
  // row above is gated on the same value.
  adAccountId: string | null;
  onSelectSub: (sub: string) => void;
}) {
  // Belt and braces with the gate in FulfillmentPage: even reached directly,
  // a Meta-backed page for an unlinked client renders the wizard rather than a
  // month of zeroes.
  const linked = Boolean((adAccountId ?? "").trim());
  if (!linked || activeSub === ADS_SETUP_SUB) {
    return (
      <AdsSetupWizard
        tenantId={tenantId}
        clientName={clientName}
        currentAccountId={adAccountId}
        onFinished={onSelectSub}
      />
    );
  }

  switch (activeSub) {
    case "dashboard":
      return <AdsDashboardPanel tenantId={tenantId} />;
    case "leads":
      return <AdsLeadTrackerPanel tenantId={tenantId} />;
    case "meta-data":
      return <AdsMetaDataPanel tenantId={tenantId} />;
    default:
      return <div className="pk-empty">We are still building this view.</div>;
  }
}
