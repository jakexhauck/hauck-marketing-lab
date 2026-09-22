import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
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

  // The whole banner is the button. It used to squeeze a sentence and a
  // separate "Start closing out" button onto one line, which wrapped the text to
  // four lines beside the button on a phone. The explanatory half-sentence went
  // with it: the title says what needs doing.
  return (
    <button
      type="button"
      onClick={() => navigate(`/sales/leads/close-out/${first}`)}
      className={
        "mb-5 flex min-h-12 w-[calc(100%-44px)] items-center gap-2.5 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-left text-[14px] text-danger transition-colors active:bg-danger/15 lg:w-full " +
        className
      }
    >
      <AlertTriangle size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 font-semibold">
        {count} {count === 1 ? "job needs" : "jobs need"} closing out
      </span>
      <ChevronRight size={18} className="shrink-0" aria-hidden />
    </button>
  );
}
