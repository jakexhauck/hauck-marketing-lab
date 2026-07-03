import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useConstraintsQuery } from "../../hooks/useApi";
import { findConstraintForPillar } from "../../lib/adminCommand";
import ConstraintPanel from "../../components/admin/ConstraintPanel";
import type { PillarConstraint } from "../../lib/api";

// A single Theory-of-Constraints pillar page: throughput, the constraint
// spotlight, and its attack plan. Service Delivery has its own dedicated
// cockpit (/admin/delivery) so it never renders here; a direct hit on that id
// redirects there, and anything else unrecognised drops back to Command.
//
// Data: useConstraintsQuery() may resolve to [] until the pillar_constraints
// migration is applied. Honest empty state below, nothing here fabricates a
// number.

type PillarId = "acquisition" | "sales" | "operations";

const PILLAR_IDS: PillarId[] = ["acquisition", "sales", "operations"];

// Local to this page on purpose: lib/pillars.ts is the retired six-lane
// config and must not be reused for the new four-pillar spine.
const PILLAR_INFO: Record<PillarId, { label: string; tagline: string }> = {
  acquisition: {
    label: "Acquisition",
    tagline: "Getting new leads into the pipeline: the top of the value chain.",
  },
  sales: {
    label: "Sales",
    tagline: "Turning leads into booked, paying work.",
  },
  operations: {
    label: "Operations",
    tagline: "The internal systems and team capacity that keep everything else running.",
  },
};

function isPillarId(id: string | undefined): id is PillarId {
  return !!id && (PILLAR_IDS as string[]).includes(id);
}

export default function AdminPillarPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const isValid = isPillarId(pillarId);

  // Hooks run unconditionally, before any redirect, so hook order stays
  // stable if the route param changes while this component stays mounted
  // (e.g. switching between two pillar links via the spine nav). The query
  // is simply disabled on an id that is about to redirect away.
  const constraintsQuery = useConstraintsQuery(isValid);
  const constraints = constraintsQuery.data ?? [];
  const constraint = isValid
    ? findConstraintForPillar(constraints, pillarId as PillarConstraint["pillar"])
    : undefined;

  // Service Delivery has its own route; keep this as a defensive redirect in
  // case the page is ever reached directly rather than through the static
  // /admin/pillar/delivery route in App.tsx.
  if (pillarId === "delivery") return <Navigate to="/admin/delivery" replace />;
  if (!isValid) return <Navigate to="/admin" replace />;

  const info = PILLAR_INFO[pillarId];

  return (
    <div className="pk-root">
      <div className="pk-kicker">Pillar</div>
      <h1 className="pk-title">{info.label}</h1>
      <p className="pk-tagline">{info.tagline}</p>

      <div className="pk-section">
        <div className="pk-section-h">Throughput</div>
        <div className="pk-report">
          <div className={`pk-report-tile${constraint?.throughputVal ? "" : " pk-pending"}`}>
            <div className="pk-report-val">
              {constraintsQuery.isLoading ? "..." : (constraint?.throughputVal ?? "Not yet wired")}
            </div>
            <div className="pk-report-label">
              {constraint?.throughputLabel ?? "No throughput metric yet"}
            </div>
          </div>
        </div>
      </div>

      <div className="pk-section">
        <div className="pk-section-h">Constraint</div>
        {constraintsQuery.isError ? (
          <div className="pk-empty">Could not load the {info.label.toLowerCase()} constraint.</div>
        ) : constraintsQuery.isLoading ? (
          <div className="pk-empty">Loading constraint...</div>
        ) : !constraint ? (
          <div className="pk-empty">{info.label} constraint not set up yet.</div>
        ) : (
          <ConstraintPanel constraint={constraint} editable />
        )}
      </div>

      {pillarId === "operations" && (
        <>
          <div className="pk-section">
            <div className="pk-section-h">Team capacity</div>
            <div className="pk-needs">
              <span className="pk-needs-dot" aria-hidden />
              No live capacity feed yet. Manage roster and workload in Service Delivery.
            </div>
            <div className="pk-links" style={{ marginTop: 10 }}>
              <Link className="pk-link" to="/admin/delivery">
                Open Service Delivery <ArrowRight />
              </Link>
            </div>
          </div>

          <div className="pk-section">
            <div className="pk-section-h">Systems</div>
            <div className="pk-links">
              <Link className="pk-link" to="/admin/sops">
                Open SOP Hub <ArrowRight />
              </Link>
              <Link className="pk-link" to="/admin/infrastructure">
                Open Infrastructure map <ArrowRight />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
