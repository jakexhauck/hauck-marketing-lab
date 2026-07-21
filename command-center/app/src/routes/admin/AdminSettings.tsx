import { Link } from "react-router-dom";
import { ScrollText } from "lucide-react";

// Agency settings (profile and defaults). Kept intentionally minimal for v1;
// a later phase wires the real agency profile here. The audit log hangs off
// this page rather than the sidebar: it is an occasional-use surface.
export default function AdminSettings() {
  return (
    <div className="pk-root">
      <div className="pk-kicker">Settings</div>
      <h1 className="pk-title">Agency Settings</h1>
      <p className="pk-tagline">Agency profile and defaults.</p>

      <div className="pk-links mb-4">
        <Link to="/admin/audit" className="pk-link">
          <ScrollText size={14} aria-hidden />
          Admin audit log
        </Link>
      </div>
      <p className="mb-5 max-w-[62ch] text-[13px] text-muted">
        The audit log records every write an admin account has made, including messages sent to a
        client&apos;s customers from the Setter Suite. It names the account that acted, not the
        person, because per-setter accounts do not exist yet.
      </p>

      <div className="pk-empty">Agency settings are coming in a later phase.</div>
    </div>
  );
}
