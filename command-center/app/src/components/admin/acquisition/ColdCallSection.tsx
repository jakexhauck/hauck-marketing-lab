import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { effectiveAdminRole } from "../../../lib/adminRoles";
import { coldCallSides, resolveColdCallView } from "../../../lib/coldCallPages";
import { stageById } from "../../../lib/coldCallStages";
import { useColdCallAssetsQuery } from "../../../hooks/useColdCallAssets";
import { groupByCategory } from "../../../../functions/lib/coldCallAssets";
import { resolveScriptId, setSelectedScriptId, useSelectedScriptId } from "../../../lib/selectedScript";
import { useAssignableCallersQuery } from "../../../hooks/useLeadAssignment";
import ScriptPanel from "../script/ScriptPanel";
import { TrackerMonthNav } from "../tracker/DailyTracker";
import { cursorForToday, type MonthCursor, type TodayRef } from "../../../lib/trackerMonth";
import ColdCallSurface from "./ColdCallSurface";
import ColdCallLeads from "./ColdCallLeads";
import ColdCallManage from "./ColdCallManage";
import ColdCallCallbacks from "./ColdCallCallbacks";
import ColdCallBooked from "./ColdCallBooked";
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

  const { left, right } = coldCallSides(isOwner);
  const view = resolveColdCallView(searchParams.get("view"), isOwner);

  // The shelf: the script variations and everything else read mid-call (0058).
  //
  // Loaded on every view of the section rather than only when the panel opens,
  // because CallWorkspace needs the variation list to attribute a dial whether
  // or not anybody opened the panel. That is what makes "tracked every single
  // time" true for a caller who never looks at the script.
  const shelfQuery = useColdCallAssetsQuery();
  const shelfAssets = useMemo(() => shelfQuery.data?.assets ?? [], [shelfQuery.data]);
  const scripts = useMemo(
    () => shelfAssets.filter((a) => a.kind === "script" && !a.archivedAt),
    [shelfAssets],
  );
  const assetGroups = useMemo(
    () => groupByCategory(shelfAssets.filter((a) => a.kind === "asset" && !a.archivedAt)),
    [shelfAssets],
  );

  // What the caller picked, corrected against what still exists.
  const picked = useSelectedScriptId();
  const selectedScriptId = resolveScriptId(picked, scripts);

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
        <nav className="pk-subtabs !m-0 flex items-center" aria-label="Cold call pages">
          {left.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pk-subtab${view === p.id ? " on" : ""}`}
              onClick={() => setView(p.id)}
            >
              {p.label}
            </button>
          ))}

          {right.length > 0 && (
            <>
              {/* The work on one side, the running of it on the other. */}
              <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-border" />
              {right.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pk-subtab${view === p.id ? " on" : ""}`}
                  onClick={() => setView(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </>
          )}
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
          // The shelf supplies the body now; this stays for the Setter Suite,
          // which passes a single document and no shelf.
          html=""
          subtitle="Agency cold calling"
          isLoading={shelfQuery.isLoading}
          isError={shelfQuery.isError}
          // Three different nothings, and telling them apart is the difference
          // between a useful hint and one that sends somebody to add a variation
          // they already added.
          emptyHint={
            scripts.length === 0
              ? isOwner
                ? "No scripts yet. Add a variation on the Settings page and it will show here."
                : "No script yet. Jake writes this one."
              : isOwner
                ? `"${scripts.find((s) => s.id === selectedScriptId)?.name ?? "This variation"}" has nothing in it yet. Write it on the Settings page.`
                : "This variation has not been written yet. Jake writes these."
          }
          onClose={() => setScriptOpen(false)}
          shelf={{
            scripts: scripts.map((s) => ({ id: s.id, name: s.name, html: s.html })),
            selectedId: selectedScriptId,
            onSelect: setSelectedScriptId,
            groups: assetGroups.map((g) => ({
              category: g.category,
              items: g.items.map((a) => ({ id: a.id, name: a.name, html: a.html })),
            })),
          }}
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
  // Most pages ARE a stage of the pipeline. Two of them have a surface built for
  // the shape of that stage: Call Back is a list ordered by when someone is due,
  // Booked is meetings split around today. Every other stage is a list you work,
  // which is one page rendered seven ways rather than seven pages.
  const stage = stageById(view);
  if (stage) {
    if (stage.id === "call-back") return <ColdCallCallbacks callerId={callerId} />;
    if (stage.id === "booked") return <ColdCallBooked callerId={callerId} />;
    return <ColdCallLeads stage={stage} callerId={callerId} />;
  }

  switch (view) {
    case "assign":
      // Unfiltered on purpose: handing work out means seeing every lead in
      // every stage, not one stage at a time.
      return <ColdCallManage callerId={callerId} />;
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
    case "settings":
      return <ColdCallSettings />;
    default:
      // resolveColdCallView never returns anything else; a miss is a bug, not a
      // state worth rendering something plausible for.
      return <div className="pk-empty">That page does not exist.</div>;
  }
}
