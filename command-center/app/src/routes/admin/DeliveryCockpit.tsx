import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

// Per-client cockpit (Overview / Ads / Leads / Inbox / Calendar / Revenue /
// Team / Config + "Enter live app"). Task 3 fills this. Placeholder for now;
// it reads the tenant id so the route is honest about what it will show.
export default function DeliveryCockpit() {
  const { tenantId } = useParams<{ tenantId: string }>();
  return (
    <div className="pk-root">
      <Link to="/admin/delivery" className="pk-back">
        <ChevronLeft />
        Back to roster
      </Link>
      <div className="pk-kicker">Account</div>
      <h1 className="pk-title">{tenantId ?? "Account"}</h1>
      <p className="pk-tagline">The per-account cockpit for this client.</p>
      <div className="pk-empty">This cockpit is coming in the next phase.</div>
    </div>
  );
}
