import FollowUpCreationPanel from "./FollowUpCreationPanel";
import { placeholderCopy, subTabsFor } from "../../../../lib/fulfillmentPages";

// Fulfillment > GHL. Everything the operator builds to be pasted INTO a
// client's GoHighLevel account.
//
// One sub-tab today (Follow Up Creation). The switch is here rather than
// inlined in FulfillmentPage so the second one is a case, not a refactor.

export default function GhlTab({
  tenantId,
  clientName,
  clientSlug,
  clientNiche,
  activeSub,
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
  clientNiche: string;
  activeSub: string;
}) {
  switch (activeSub) {
    case "follow-ups":
      return (
        <FollowUpCreationPanel
          tenantId={tenantId}
          clientName={clientName}
          clientSlug={clientSlug}
          clientNiche={clientNiche}
        />
      );
    default: {
      const label = subTabsFor("ghl").find((s) => s.id === activeSub)?.label ?? "This";
      return <div className="pk-empty">{placeholderCopy(label)}</div>;
    }
  }
}
