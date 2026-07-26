import { HeartHandshake } from "lucide-react";
import DeliveryRoster from "../../components/admin/DeliveryRoster";
import PickPrompt from "../../components/admin/PickPrompt";

// Service Delivery landing (/admin/delivery): the persistent tenant roster rail
// on the left, and a prompt to pick one on the right. Selecting a tenant in the
// roster navigates to the per-account cockpit (/admin/delivery/:tenantId);
// DeliveryRoster is shared with that route so the rail never disappears.
//
// The right pane used to hold the delivery Theory-of-Constraints panel. It was
// removed: the work on this surface is per-account, so a whole-pillar essay was
// only ever something to click past on the way to a client.

export default function AdminDelivery() {
  return (
    <div className="pk-delivery-shell">
      <DeliveryRoster />

      <div className="pk-root">
        <PickPrompt
          icon={<HeartHandshake size={22} />}
          title="Pick a client"
          sub="Choose an account from the list to open its cockpit."
        />
      </div>
    </div>
  );
}
