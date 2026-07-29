import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessagesSquare, ScrollText } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { effectiveAdminRole } from "../../../lib/adminRoles";
import {
  coldCallSides,
  resolveColdCallView,
  resolveManagementPage,
} from "../../../lib/coldCallPages";
import { stageById } from "../../../lib/coldCallStages";
import { useColdCallAssetsQuery } from "../../../hooks/useColdCallAssets";
import { groupByCategory } from "../../../../functions/lib/coldCallAssets";
import { resolveScriptId, setSelectedScriptId, useSelectedScriptId } from "../../../lib/selectedScript";
import { useAssignableCallersQuery } from "../../../hooks/useLeadAssignment";
import { useSyncAdminLeadsFromGhl } from "../../../hooks/useAdminLeads";
import ScriptPanel from "../script/ScriptPanel";
import { TrackerMonthNav } from "../tracker/DailyTracker";
import { cursorForToday, type MonthCursor, type TodayRef } from "../../../lib/trackerMonth";
import ColdCallSurface, { AGENCY_CALLER_ID } from "./ColdCallSurface";
import ColdCallLeads from "./ColdCallLeads";
import ColdCallManagement from "./ColdCallManagement";
import ColdCallCallbacks from "./ColdCallCallbacks";
import ColdCallBooked from "./ColdCallBooked";
import ColdCallAvailability from "./ColdCallAvailability";
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
  // Its own state, so the two panels are independent: reading an objection does
  // not close the script somebody is halfway through.
  const [objectionsOpen, setObjectionsOpen] = useState(false);

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
  const assetGroups = useMemo(
    () => groupByCategory(shelfAssets.filter((a) => a.kind === "asset" && !a.archivedAt)),
    [shelfAssets],
  );

  // Objection handling gets its own button and its own panel, because it is not
  // read like the rest of the shelf. It is reached for at one specific moment,
  // mid-sentence, while somebody is talking, and digging two levels into a
  // panel to find it is two levels too many at that moment.
  //
  // Found by name rather than by a fixed id, so Jake can rewrite the document
  // (or replace it entirely) from Management without anything here changing.
  const objections = useMemo(
    () =>
      shelfAssets.find(
        (a) => a.kind === "asset" && !a.archivedAt && /objection/i.test(a.name),
      ) ?? null,
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
          <button
            type="button"
            className="pk-link"
            onClick={() => setObjectionsOpen((s) => !s)}
            aria-pressed={objectionsOpen}
          >
            <MessagesSquare aria-hidden />
            Objections
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

      {/* Objection handling, on the other side of the screen so both can be
          open at once: the script being worked from on the left, the answer to
          what was just said on the right. No shelf, because this panel is one
          document and a picker on it would only be a way to lose it. */}
      {objectionsOpen && (
        <ScriptPanel
          title="Objection handling"
          dock="right"
          html={objections?.html ?? ""}
          subtitle={objections?.name ?? "Agency cold calling"}
          isLoading={shelfQuery.isLoading}
          isError={shelfQuery.isError}
          emptyHint={
            !objections
              ? isOwner
                ? 'Nothing here yet. Add a shelf document with "objection" in its name under Management > Shelf and it opens from this button.'
                : "No objection handling written yet. Jake writes this one."
              : isOwner
                ? `"${objections.name}" has nothing in it yet. Write it under Management > Shelf.`
                : "This has not been written yet. Jake writes these."
          }
          onClose={() => setObjectionsOpen(false)}
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
      // Unlike the tracker, this one cannot be summed: a week of availability is
      // hours belonging to a person, and two people's hours painted onto one
      // grid would make every cell ambiguous about whose it is. The component
      // asks the owner to pick somebody.
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
