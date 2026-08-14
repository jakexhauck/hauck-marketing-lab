import CalendarPanel from "./CalendarPanel";
import ConversionAssetPanel from "./ConversionAssetPanel";
import GhlSetupWizard from "./GhlSetupWizard";
import { GHL_SETUP_SUB, placeholderCopy, subTabsFor } from "../../../../lib/fulfillmentPages";

// Fulfillment > GHL. Everything the operator builds to be pasted INTO a
// client's GoHighLevel account.
//
// One sub-tab today (Conversion Assets). The switch is here rather than
// inlined in FulfillmentPage so the second one is a case, not a refactor.

export default function GhlTab({
  tenantId,
  clientName,
  clientSlug,
  activeSub,
  ghlConnected,
  onSelectSub,
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
  activeSub: string;
  /** Whether this client has real GHL credentials on their row. */
  ghlConnected: boolean;
  onSelectSub: (sub: string) => void;
}) {
  // Belt and braces with the gate in FulfillmentPage: even reached directly, a
  // GHL-backed panel for an unwired client renders the wizard rather than an
  // empty account.
  if (!ghlConnected && activeSub !== "conversion-assets") {
    return (
      <GhlSetupWizard tenantId={tenantId} clientName={clientName} onFinished={onSelectSub} />
    );
  }

  switch (activeSub) {
    case GHL_SETUP_SUB:
      return (
        <GhlSetupWizard tenantId={tenantId} clientName={clientName} onFinished={onSelectSub} />
      );
    case "conversion-assets":
      return (
        <ConversionAssetPanel
          tenantId={tenantId}
          clientName={clientName}
          clientSlug={clientSlug}
        />
      );
    case "calendars":
      return (
        <CalendarPanel
          tenantId={tenantId}
          clientName={clientName}
          clientSlug={clientSlug}
        />
      );
    default: {
      const label = subTabsFor("ghl").find((s) => s.id === activeSub)?.label ?? "This";
      return <div className="pk-empty">{placeholderCopy(label)}</div>;
    }
  }
}
