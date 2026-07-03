import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import DeliveryRoster from "../../components/admin/DeliveryRoster";
import ConstraintPanel from "../../components/admin/ConstraintPanel";
import { useAdminClientsQuery, useConstraintsQuery } from "../../hooks/useApi";
import { findConstraintForPillar } from "../../lib/adminCommand";
import { atRiskClients, healthLabel } from "../../lib/deliveryRoster";

// Service Delivery landing (/admin/delivery): the persistent tenant roster
// rail on the left, the delivery-pillar Theory-of-Constraints overview as the
// default main region on the right. Selecting a tenant in the roster
// navigates to the per-account cockpit (/admin/delivery/:tenantId, Task 3.2);
// DeliveryRoster is shared with that route so the rail never disappears.
//
// Data: getConstraints() may resolve to [] until the pillar_constraints
// migration is applied; the client list's healthStatus/healthNote likewise
// 500 until that migration runs. Every section below has an honest empty /
// error state for that; nothing here fabricates a number.

export default function AdminDelivery() {
  const constraintsQuery = useConstraintsQuery(true);
  const clientsQuery = useAdminClientsQuery(true);

  const constraint = findConstraintForPillar(constraintsQuery.data ?? [], "delivery");
  const atRisk = atRiskClients(clientsQuery.data?.clients ?? []);

  return (
    <div className="pk-delivery-shell">
      <DeliveryRoster />

      <div className="pk-root">
        <div className="pk-kicker">Service Delivery</div>
        <h1 className="pk-title">Service Delivery</h1>
        <p className="pk-tagline">
          The client roster, the delivery-pillar constraint, and the accounts it is straining.
        </p>

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

        <div className="pk-section">
          <div className="pk-section-h">At-risk accounts</div>
          {clientsQuery.isError ? (
            <div className="pk-empty">Could not load clients.</div>
          ) : clientsQuery.isLoading ? (
            <div className="pk-empty">Loading clients...</div>
          ) : atRisk.length === 0 ? (
            <div className="pk-empty">All accounts healthy.</div>
          ) : (
            <div className="pk-list">
              {atRisk.map((c) => (
                <Link key={c.id} to={`/admin/delivery/${c.id}`} className="pk-li">
                  <span
                    className="pk-li-idx"
                    style={{ background: c.brandColor, color: "#fff" }}
                    aria-hidden
                  >
                    {c.brandInitials || c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="pk-li-main">
                    <div className="pk-li-label">{c.name}</div>
                    <div className="pk-li-sub">{c.healthNote || healthLabel(c.healthStatus)}</div>
                  </div>
                  <div className="pk-li-meta">
                    <span className="pk-li-chev" aria-hidden>
                      <ChevronRight />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
