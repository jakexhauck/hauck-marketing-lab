import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { effectiveAdminRole } from "../../../lib/adminRoles";
import {
  coldCallSides,
  resolveColdCallView,
  resolveManagementPage,
} from "../../../lib/coldCallPages";
import { stageById } from "../../../lib/coldCallStages";
import { useColdCallAssetsQuery } from "../../../hooks/useColdCallAssets";
import { assetHtml, useDriveDocs } from "../../../hooks/useDriveDoc";
import { resolveScriptId, setSelectedScriptId, useSelectedScriptId } from "../../../lib/selectedScript";
import { useAssignableCallersQuery } from "../../../hooks/useLeadAssignment";
import { useSyncAdminLeadsFromGhl } from "../../../hooks/useAdminLeads";
import ScriptPanel from "../script/ScriptPanel";
import { TAB_TRACK, TabButton } from "../../PageTabs";
import { TrackerMonthNav } from "../tracker/DailyTracker";
import { cursorForToday, type MonthCursor, type TodayRef } from "../../../lib/trackerMonth";
import ColdCallSurface, { AGENCY_CALLER_ID } from "./ColdCallSurface";
import ColdCallLeads from "./ColdCallLeads";
import ColdCallManagement from "./ColdCallManagement";
import ColdCallCallbacks from "./ColdCallCallbacks";
import ColdCallBooked from "./ColdCallBooked";
import ColdCallAvailability from "./ColdCallAvailability";
import ColdCallAgencyAvailability from "./ColdCallAgencyAvailability";
import ColdCallSops from "./ColdCallSops";

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
  // person: the same five pages, scoped. "" means the agency: everyone at once.
  //
  // A caller never sees the selector and is pinned to themselves by the API,
  // regardless of what is rendered here.
  const [callerId, setCallerId] = useState("");
  const callers = useAssignableCallersQuery(isOwner);
  const scope = isOwner ? callerId : (admin?.id ?? "");

  const { left, right } = coldCallSides(isOwner);
  const view = resolveColdCallView(searchParams.get("view"), isOwner);

  // Bring in anything sitting in the GoHighLevel board that the book has never
  // seen: a prospect created over there (a form, an import, by hand) used to
  // exist in no queue and no count here.
  //
  // Fired once when the section opens rather than behind a button, because a
  // lead you have to remember to go and fetch is a lead that sits there. The
  // endpoint matches on contact id and phone number, so running it again adds
  // nothing; that is what makes doing it unprompted safe.
  const sync = useSyncAdminLeadsFromGhl();
  const syncOnce = useRef(false);
  useEffect(() => {
    if (syncOnce.current) return;
    syncOnce.current = true;
    sync.mutate();
    // Deliberately once per mount: sync.mutate is stable and re-running on any
    // dependency change would turn a page interaction into a round trip to GHL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only say something when there is something to say. A silent no-op sync is
  // the normal case and does not deserve a line of the caller's screen.
  const syncResult = sync.data;
  const syncNote = useMemo(() => {
    if (sync.isError) return "Could not reach GoHighLevel, so any new prospects there are not in this list yet.";
    if (!syncResult || syncResult.added === 0) return "";
    const n = syncResult.added;
    const stages = syncResult.skippedStages ?? [];
    const drift = stages.length
      ? ` ${stages.length === 1 ? "One prospect sits" : "Prospects sit"} in ${stages.join(", ")}, which has no page here.`
      : "";
    return `Added ${n} new ${n === 1 ? "prospect" : "prospects"} from ${syncResult.pipeline ?? "GoHighLevel"}.${drift}`;
  }, [sync.isError, syncResult]);

  // The team availability page IS the whole roster, so a "whose section is
  // this" selector sitting above it would be a control with nothing to control.
  const rosterWide =
    view === "management" && resolveManagementPage(searchParams.get("manage")) === "availability";

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
  // Objection handling. Its own kind since 0077, so it is found by what it IS
  // rather than by a name matching /objection/i, which was how a document got
  // promoted to "the objections document" by being named well.
  //
  // It renders inside the script panel underneath the pitch rather than behind a
  // button of its own: it is reached for mid-sentence, while somebody is talking,
  // and a click at that moment is a click too many.
  const objections = useMemo(
    () => shelfAssets.find((a) => a.kind === "objections" && !a.archivedAt) ?? null,
    [shelfAssets],
  );

  // Every document these panels might show, resolved against Drive in one go.
  // A script and the objections document are pointers now; a row not yet pointed
  // anywhere still renders the text it already had. assetHtml owns that rule.
  const driveDocs = useDriveDocs([
    ...scripts.map((s) => s.driveFileId),
    objections?.driveFileId ?? null,
  ]);

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
        {/* The section's own pages, in the same segmented track the header
            panel above uses. Two groups in ONE track, split by a divider: the
            work on the left, the running of it on the right.

            Deliberately not the sliding-indicator variant. A track whose pill
            slides across a seam reads as broken rather than smooth, which is
            exactly why TabButton exists alongside TabLinks. */}
        <nav
          aria-label="Cold call pages"
          className="flex min-w-0 shrink-0 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <div className={TAB_TRACK}>
            {left.map((p) => (
              <TabButton key={p.id} active={view === p.id} onClick={() => setView(p.id)}>
                {p.label}
              </TabButton>
            ))}

            {right.length > 0 && (
              <>
                <span aria-hidden className="mx-1.5 my-1 w-px shrink-0 bg-border" />
                {right.map((p) => (
                  <TabButton key={p.id} active={view === p.id} onClick={() => setView(p.id)}>
                    {p.label}
                  </TabButton>
                ))}
              </>
            )}
          </div>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          {isOwner && !rosterWide && (
            <select
              className="pk-select pk-select-pill"
              value={callerId}
              onChange={(e) => setCallerId(e.target.value)}
              aria-label="Whose cold calling to show"
            >
              {/* The whole operation, not "nobody in particular": every page in
                  this section reads agency-wide with no caller chosen. */}
              <option value="">Agency</option>
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

      {syncNote && (
        <p className="mb-4 text-[13px] text-muted" role="status">
          {syncNote}
        </p>
      )}

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
                ? "No scripts yet. Add a variation under Management > Scripts and it will show here."
                : "No script yet. Jake writes this one."
              : isOwner
                ? `"${scripts.find((s) => s.id === selectedScriptId)?.name ?? "This variation"}" has nothing in it yet. Write it under Management > Scripts.`
                : "This variation has not been written yet. Jake writes these."
          }
          onClose={() => setScriptOpen(false)}
          shelf={{
            scripts: scripts.map((s) => ({
              id: s.id,
              name: s.name,
              html: assetHtml(s, driveDocs).html,
            })),
            selectedId: selectedScriptId,
            onSelect: setSelectedScriptId,
            objections: objections
              ? {
                  name: objections.name,
                  html: assetHtml(objections, driveDocs).html,
                  empty: isOwner
                    ? "Point this at a document under Management > Scripts."
                    : "Not written yet. Jake writes this one.",
                }
              : null,
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
    case "management":
      return <ColdCallManagement callerId={callerId} />;
    case "tracker":
      // With nobody chosen, an owner gets the same grid reading the whole
      // roster: each caller's day resolved on its own and then added up, so the
      // agency month equals the sum of the individual months. It is read-only,
      // which is the one difference: a total is not a row anybody can type into.
      if (!callerId && !isOwner) {
        return <div className="pk-empty">No tracker for this view.</div>;
      }
      return (
        <ColdCallSurface
          cursor={cursor}
          onCursorChange={onCursorChange}
          callerId={callerId || AGENCY_CALLER_ID}
        />
      );
    case "availability":
      // On Agency, the same week read across everybody: colour-coded by who,
      // read-only. It cannot be SUMMED the way the tracker is (hours belong to a
      // person, and a merged cell has no one owner to paint into), so the
      // agency version shows whose hours are whose instead of merging them into
      // one anonymous block.
      if (!callerId && isOwner) return <ColdCallAgencyAvailability />;
      return <ColdCallAvailability callerId={callerId} isOwner={isOwner} />;
    case "sops":
      // Roster-wide by nature: an SOP is the same document for everyone, so the
      // person selector does not scope it.
      return <ColdCallSops />;
    default:
      // resolveColdCallView never returns anything else; a miss is a bug, not a
      // state worth rendering something plausible for.
      return <div className="pk-empty">That page does not exist.</div>;
  }
}
