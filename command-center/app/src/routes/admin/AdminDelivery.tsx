import DeliveryRoster from "../../components/admin/DeliveryRoster";
import ConstraintPanel from "../../components/admin/ConstraintPanel";
import { useConstraintsQuery } from "../../hooks/useApi";
import { findConstraintForPillar } from "../../lib/adminCommand";

// Service Delivery landing (/admin/delivery): the persistent tenant roster
// rail on the left, the delivery-pillar Theory-of-Constraints overview as the
// default main region on the right. Selecting a tenant in the roster
// navigates to the per-account cockpit (/admin/delivery/:tenantId, Task 3.2);
// DeliveryRoster is shared with that route so the rail never disappears.
//
// Data: getConstraints() may resolve to [] until the pillar_constraints
// migration is applied. The section below has an honest empty / error state
// for that; nothing here fabricates a number.

export default function AdminDelivery() {
  const constraintsQuery = useConstraintsQuery(true);

  const constraint = findConstraintForPillar(constraintsQuery.data ?? [], "delivery");

  return (
    <div className="pk-delivery-shell">
      <DeliveryRoster />

      <div className="pk-root">
        <h1 className="pk-title">Fulfillment</h1>

        <div className="pk-section">
          <div className="pk-section-h">Delivery constraint</div>
          {constraintsQuery.isError ? (
            <div className="pk-empty">Could not load the delivery constraint.</div>
          ) : constraintsQuery.isLoading ? (
            <div className="pk-empty">Loading constraint...</div>
          ) : !constraint ? (
            <div className="pk-empty">Delivery constraint not set up yet.</div>
          ) : (
            <ConstraintPanel constraint={constraint} editable />
          )}
        </div>
      </div>
    </div>
  );
}
