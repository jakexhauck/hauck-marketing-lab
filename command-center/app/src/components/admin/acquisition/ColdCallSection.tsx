import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { effectiveAdminRole } from "../../../lib/adminRoles";
import { coldCallPagesFor, resolveColdCallView } from "../../../lib/coldCallPages";
import { useColdCallScriptQuery } from "../../../hooks/useApi";
import { useAssignableCallersQuery } from "../../../hooks/useLeadAssignment";
import ScriptPanel from "../script/ScriptPanel";
import { TrackerMonthNav } from "../tracker/DailyTracker";
import { cursorForToday, type MonthCursor, type TodayRef } from "../../../lib/trackerMonth";
import ColdCallSurface from "./ColdCallSurface";
import ColdCallLeads from "./ColdCallLeads";
import ColdCallCallbacks from "./ColdCallCallbacks";
import ColdCallBooked from "./ColdCallBooked";
import ColdCallPipelines from "./ColdCallPipelines";
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

  // The tracker's month lives here rather than inside the tracker, so its
  // stepper can sit in this header row beside the Dialing script button instead
  // of costing a full row above the tiles.
  const today = useMemo<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, []);
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(today));

  // Whose section this is. An owner switches between people, which is what makes
  // "each caller has their own page" true without building five pages per
  // person: the same five pages, scoped. "" means everyone.
  //
  // A caller never sees the selector and is pinned to themselves by the API,
  // regardless of what is rendered here.
  const [callerId, setCallerId] = useState("");
  const callers = useAssignableCallersQuery(isOwner);
  const scope = isOwner ? callerId : (admin?.id ?? "");

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

        <div className="flex flex-wrap items-center gap-3">
          {isOwner && (
            <select
              className="pk-select !w-auto"
              value={callerId}
              onChange={(e) => setCallerId(e.target.value)}
              aria-label="Whose cold calling to show"
            >
              <option value="">Everyone</option>
              {(callers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {view === "tracker" && (
            <TrackerMonthNav cursor={cursor} today={today} onMonthChange={setCursor} />
          )}
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
      </div>

      <ColdCallBody
        view={view}
        cursor={cursor}
        onCursorChange={setCursor}
        callerId={scope}
        isOwner={isOwner}
      />

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

function ColdCallBody({
  view,
  cursor,
  onCursorChange,
  callerId,
  isOwner,
}: {
  view: string;
  cursor: MonthCursor;
  onCursorChange: (cursor: MonthCursor) => void;
  // "" means everyone (owner viewing the whole operation).
  callerId: string;
  isOwner: boolean;
}) {
  switch (view) {
    case "leads":
      return <ColdCallLeads callerId={callerId} />;
    case "callbacks":
      return <ColdCallCallbacks callerId={callerId} />;
    case "booked":
      return <ColdCallBooked callerId={callerId} />;
    case "pipelines":
      // Nobody's boards but the agency's: GHL has no idea which caller is
      // looking, so this one page ignores the person selector rather than
      // pretending to filter by it.
      return <ColdCallPipelines />;
    case "tracker":
      // A tracker grid is one person's hand-typed month. There is no honest way
      // to merge two people's rows into one editable grid, so "Everyone" asks
      // for a name rather than inventing a combined month.
      if (!callerId) {
        return (
          <div className="pk-empty">
            {isOwner
              ? "Pick a person above to see their dialing tracker."
              : "No tracker for this view."}
          </div>
        );
      }
      return (
        <ColdCallSurface
          cursor={cursor}
          onCursorChange={onCursorChange}
          callerId={callerId}
        />
      );
    case "scoreboard":
      return <ColdCallScoreboard callerId={callerId} />;
    case "settings":
      return <ColdCallSettings />;
    default:
      // resolveColdCallView never returns anything else; a miss is a bug, not a
      // state worth rendering something plausible for.
      return <div className="pk-empty">That page does not exist.</div>;
  }
}
