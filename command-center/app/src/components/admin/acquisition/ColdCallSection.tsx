import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { effectiveAdminRole } from "../../../lib/adminRoles";
import { coldCallPagesFor, resolveColdCallView } from "../../../lib/coldCallPages";
import { useColdCallScriptQuery } from "../../../hooks/useApi";
import ScriptPanel from "../script/ScriptPanel";
import ColdCallSurface from "./ColdCallSurface";
import ColdCallLeads from "./ColdCallLeads";
import ColdCallCallbacks from "./ColdCallCallbacks";
import ColdCallBooked from "./ColdCallBooked";
import ColdCallScoreboard from "./ColdCallScoreboard";
import ColdCallSettings from "./ColdCallSettings";

// Acquisition > Cold Call. Unlike its sibling tabs this is a section rather than
// a single surface: the caller works Leads all day, checks Callbacks, and the
// rest are there to be looked at rather than lived in.
//
// The strip under the page title is this section's own; the pillar's siblings
// (SMS and so on) live in the sidebar dropdown, not here.
//
// The dialing script rides along on every page as a floating panel, the same one
// the Setter Suite uses, because a script you have to navigate to is a script
// nobody reads mid-call.
export default function ColdCallSection() {
  const { admin } = useAuth();
  const isOwner = effectiveAdminRole(admin?.role) === "owner";
  const [searchParams, setSearchParams] = useSearchParams();
  const [scriptOpen, setScriptOpen] = useState(false);

  const pages = coldCallPagesFor(isOwner);
  const view = resolveColdCallView(searchParams.get("view"), isOwner);

  // Only load the script once it is asked for: most page views never open it.
  const scriptQuery = useColdCallScriptQuery(scriptOpen);

  const setView = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("view", next);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="pk-subtabs !m-0" aria-label="Cold call pages">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pk-subtab${view === p.id ? " on" : ""}`}
              onClick={() => setView(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="pk-link"
          onClick={() => setScriptOpen((s) => !s)}
          aria-pressed={scriptOpen}
        >
          <ScrollText aria-hidden />
          Dialing script
        </button>
      </div>

      <ColdCallBody view={view} />

      {scriptOpen && (
        <ScriptPanel
          html={scriptQuery.data?.html ?? ""}
          subtitle="Agency cold calling"
          isLoading={scriptQuery.isLoading}
          isError={scriptQuery.isError}
          emptyHint={
            isOwner
              ? "No script yet. Write it on the Settings page and it will show here."
              : "No script yet. Jake writes this one."
          }
          onClose={() => setScriptOpen(false)}
        />
      )}
    </>
  );
}

function ColdCallBody({ view }: { view: string }) {
  switch (view) {
    case "leads":
      return <ColdCallLeads />;
    case "callbacks":
      return <ColdCallCallbacks />;
    case "booked":
      return <ColdCallBooked />;
    case "tracker":
      return <ColdCallSurface />;
    case "scoreboard":
      return <ColdCallScoreboard />;
    case "settings":
      return <ColdCallSettings />;
    default:
      // resolveColdCallView never returns anything else; a miss is a bug, not a
      // state worth rendering something plausible for.
      return <div className="pk-empty">That page does not exist.</div>;
  }
}
