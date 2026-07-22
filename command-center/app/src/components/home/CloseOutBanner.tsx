import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCloseOutCountQuery } from "../../hooks/useApi";

// "3 jobs need closing out" — the loudest of the three nudges, on the first
// screen anyone opens.
//
// Renders nothing at zero: a permanent strip saying everything is fine is the
// placeholder chatter a client should never see. Shared by the desktop and phone
// Home so the two cannot drift.
export default function CloseOutBanner({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const query = useCloseOutCountQuery(Boolean(session));

  const count = query.data?.count ?? 0;
  const first = query.data?.opportunityIds?.[0];
  if (count === 0 || !first) return null;

  return (
    <div
      className={
        "mb-5 flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger " +
        className
      }
    >
      <AlertTriangle size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0">
        <strong className="font-semibold">
          {count} {count === 1 ? "job needs" : "jobs need"} closing out
        </strong>{" "}
        before {count === 1 ? "it counts" : "they count"} toward your customers and revenue.
      </span>
      <button
        type="button"
        onClick={() => navigate(`/sales/leads/close-out/${first}`)}
        className="ml-auto shrink-0 rounded-[var(--radius)] border border-danger/40 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-danger/10"
      >
        {count === 1 ? "Close it out" : "Start closing out"}
      </button>
    </div>
  );
}
