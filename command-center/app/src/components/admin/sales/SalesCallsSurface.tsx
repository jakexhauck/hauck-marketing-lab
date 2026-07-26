import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, TriangleAlert } from "lucide-react";
import {
  SALES_CALL_VIEWS,
  VIEW_LABELS,
  resolveView,
  todayCalls,
  upcomingCalls,
  followUpsOwed,
  historyCalls,
  needsLoggingCount,
  searchCalls,
  formatDay,
  localDay,
  type SalesCall,
  type SalesCallView,
} from "../../../lib/salesCalls";
import { useSalesCallsQuery, defaultWindow } from "../../../hooks/useSalesCalls";
import SalesCallCard from "./SalesCallCard";
import SalesCallWorkspace from "./SalesCallWorkspace";
import SalesCallsStyle from "./SalesCallsStyle";

// Sales > Sales Calls. The demo call with a business owner: what is booked,
// and what happened on it.
//
// This is the tab body of the Sales PillarPage, so it renders no header of its
// own. The four views are pure functions over ONE window query
// (src/lib/salesCalls.ts), so switching between them never refetches and a call
// logged in one is immediately right in the others.
//
// Nothing here is fabricated. An account with no demo calls booked shows an
// empty state saying so, not a placeholder card.

export default function SalesCallsSurface() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveView(searchParams.get("view"));

  // Computed once per mount. A window recomputed on every render would change
  // the query key on every render and refetch forever.
  const [window] = useState(() => defaultWindow());
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [openCall, setOpenCall] = useState<SalesCall | null>(null);

  const callsQuery = useSalesCallsQuery(window);
  const data = callsQuery.data;
  const calls = useMemo(() => data?.calls ?? [], [data]);

  const setView = (next: SalesCallView) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("view", next);
        return params;
      },
      { replace: true },
    );
  };

  const buckets = useMemo(
    () => ({
      today: todayCalls(calls, now),
      upcoming: upcomingCalls(calls, now),
      "follow-ups": followUpsOwed(calls, now),
      history: historyCalls(calls, now),
    }),
    [calls, now],
  );

  const unlogged = useMemo(() => needsLoggingCount(calls, now), [calls, now]);

  // The workspace reads from the live list rather than from the snapshot taken
  // when it opened, so an autosave landing mid-call is reflected rather than
  // fought over.
  const activeCall = openCall ? (calls.find((c) => c.id === openCall.id) ?? openCall) : null;

  if (callsQuery.isPending) {
    return <div className="pk-empty">Loading demo calls...</div>;
  }

  if (callsQuery.isError) {
    return (
      <div className="pk-empty">
        Could not read the demo calendar. Reload the tab to try again.
      </div>
    );
  }

  // Two honest "not set up yet" states. Neither is an error, and each says the
  // one thing that fixes it.
  if (data && !data.configured) {
    return (
      <div className="pk-empty">
        The agency booking account is not connected, so there are no demo calls to show.
        Set AGENCY_GHL_LOCATION_ID and AGENCY_GHL_TOKEN, then reload.
      </div>
    );
  }

  if (data && !data.calendarChosen) {
    return (
      <div className="pk-empty">
        No demo calendar has been chosen yet. Pick the one that holds demo calls under
        Acquisition, Cold Call, Settings, then come back.
      </div>
    );
  }

  const visible =
    view === "history" ? searchCalls(buckets.history, query) : buckets[view];

  return (
    <div className="scc">
      <SalesCallsStyle />

      <nav className="scc-views" aria-label="Sales call views">
        {SALES_CALL_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            className={`pk-tab${view === v ? " on" : ""}`}
            onClick={() => setView(v)}
          >
            {VIEW_LABELS[v]}
            {buckets[v].length > 0 && <span className="pk-tabcount">{buckets[v].length}</span>}
          </button>
        ))}
      </nav>

      {/* The one number on this page worth nagging about: every unlogged past
          call is a hole in the Sales Data funnel, and the funnel is the reason
          any of this exists. */}
      {unlogged > 0 && view !== "history" && (
        <p className="scc-nudge">
          <TriangleAlert size={14} aria-hidden />
          {unlogged === 1
            ? "1 past call has no outcome logged. Sales Data undercounts until it does."
            : `${unlogged} past calls have no outcome logged. Sales Data undercounts until they do.`}{" "}
          <button type="button" className="pk-link" onClick={() => setView("history")}>
            Show them
          </button>
        </p>
      )}

      {view === "history" && (
        <div className="scc-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search past calls by name, business, phone or email"
            aria-label="Search past calls"
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="pk-empty">{emptyCopy(view, query)}</div>
      ) : (
        <div className="pk-list">
          {view === "upcoming" || view === "history"
            ? groupByDay(visible).map(([day, rows]) => (
                <div key={day}>
                  <div className="pk-list-sec-h">{formatDay(rows[0].scheduledAt)}</div>
                  {rows.map((c) => (
                    <SalesCallCard
                      key={c.id}
                      call={c}
                      now={now}
                      onOpen={view === "upcoming" ? undefined : setOpenCall}
                    />
                  ))}
                </div>
              ))
            : visible.map((c) => (
                <SalesCallCard
                  key={c.id}
                  call={c}
                  now={now}
                  showDay={view === "follow-ups"}
                  onOpen={setOpenCall}
                />
              ))}
        </div>
      )}

      {activeCall && (
        <SalesCallWorkspace call={activeCall} onClose={() => setOpenCall(null)} />
      )}
    </div>
  );
}

// Days in the order the list already sorted them, so grouping never reorders.
function groupByDay(calls: SalesCall[]): [string, SalesCall[]][] {
  const out = new Map<string, SalesCall[]>();
  for (const call of calls) {
    const day = localDay(call.scheduledAt);
    const list = out.get(day) ?? [];
    list.push(call);
    out.set(day, list);
  }
  return [...out.entries()];
}

// Each empty state says what would put something here, rather than "no data".
function emptyCopy(view: SalesCallView, query: string): string {
  if (view === "history" && query.trim()) {
    return "No past call matches that search.";
  }
  switch (view) {
    case "today":
      return "No demo calls booked today.";
    case "upcoming":
      return "Nothing booked in the next seven days. Meetings land here when a cold call ends in Booked.";
    case "follow-ups":
      return "No follow-ups owed. Every call that needed a second one has had it.";
    case "history":
      return "No demo calls have happened yet.";
  }
}
