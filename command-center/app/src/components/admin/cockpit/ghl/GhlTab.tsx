import ConversionAssetPanel from "./ConversionAssetPanel";
import { placeholderCopy, subTabsFor } from "../../../../lib/fulfillmentPages";

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
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
  activeSub: string;
}) {
  switch (activeSub) {
    case "conversion-assets":
      return (
        <ConversionAssetPanel
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
