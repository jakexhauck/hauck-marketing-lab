import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  LayoutGrid,
  MessagesSquare,
  ScrollText,
  Settings,
  Trophy,
} from "lucide-react";
import {
  useAdminClientsQuery,
  useSetterPipelinesQuery,
  useSetterLeadsQuery,
  useSetterEventsQuery,
} from "../../hooks/useApi";
import { useNow } from "../../context/NowContext";
import { Segmented } from "../../components/ui";
import SetterBoard from "../../components/admin/setter/SetterBoard";
import SetterCockpit from "../../components/admin/setter/SetterCockpit";
import SetterInbox from "../../components/admin/setter/SetterInbox";
import SetterCalendar from "../../components/admin/setter/SetterCalendar";
import SetterSettings from "../../components/admin/setter/SetterSettings";
import SetterResults from "../../components/admin/setter/SetterResults";
import SetterScoreStrip from "../../components/admin/setter/SetterScoreStrip";
import SetterCallbacksRail from "../../components/admin/setter/SetterCallbacksRail";
import SetterScriptOverlay from "../../components/admin/setter/SetterScriptOverlay";
import ClientPicker from "../../components/admin/setter/ClientPicker";
import type { ApiSetterLead } from "../../lib/api";
import type { BookingIntent } from "../../lib/setterBooking";
import {
  lockFor,
  lockedContactIds,
  resolveLocks,
  type AutomationLock,
} from "../../lib/setterAutomationLock";
import { dialCheckKey, orderByNumberPrefix } from "../../lib/setterModel";
import {
  appointmentFor,
  isApptTrackedStage,
  type LeadAppointment,
} from "../../lib/setterApptConfirm";

// Pipeline = the pipelines and the cockpit. Inbox = the client's whole
// conversation list, readable and replyable. Calendar = what is already booked,
// plus the client's Google busy hours, with booking straight off the grid.
// Settings = per-client suite configuration; today that is the dialing script
// (which replaced the retired Dialing Hub tab).
//
// The Pipeline tab's stored value is still "board". Renaming it would reject
// every setter's persisted hml_setter_view and silently reset their tab, which
// is not worth it for a label change. A stored "dialhub" from before the
// retirement maps to "settings" for the same reason.
type SetterView = "board" | "inbox" | "calendar" | "results" | "settings";
const SETTER_VIEW_KEY = "hml_setter_view";

// A stored "scoreboard" (the retired tab; its numbers live on the board
// strip now) falls through to the "board" default below.
function isSetterView(v: string | null | undefined): v is SetterView {
  return (
    v === "board" || v === "inbox" || v === "calendar" || v === "results" || v === "settings"
  );
}

// Pipeline switcher labels: the CRM names carry a numbering prefix and a
// "Pipeline" suffix ("1) Lead Form Pipeline") that read as clutter on a pill
// control. Falls back to the raw name if stripping would empty it.
function pipelineTabLabel(name: string): string {
  const cleaned = name
    .replace(/^\s*\d+\)\s*/, "")
    .replace(/\s*pipeline\s*$/i, "")
    .trim();
  return cleaned || name;
}

function initialSetterView(): SetterView {
  try {
    const v = window.localStorage.getItem(SETTER_VIEW_KEY);
    if (v === "dialhub") return "settings";
    if (isSetterView(v)) return v;
  } catch {
    /* ignore */
  }
  return "board";
}

// /admin/setter: the Setter Suite. One client's leads worked across every one
// of that client's pipelines, unfiltered (unlike the client-facing app, which
// hides retired/system pipelines and stages). Pipeline tabs across the top,
// the real stage columns underneath, and a docked cockpit (dial logging,
// tags, booking) on the right whenever a card is selected.
//
// The client picker sits ABOVE the tab switcher on purpose: one client
// selection drives all three tabs, so the inbox can never be showing one client
// while the pipeline shows another. Switching client keeps the open tab.
export default function SetterSuite() {
  const clientsQuery = useAdminClientsQuery(true);
  const clients = clientsQuery.data?.clients ?? [];

  const [tenantId, setTenantId] = useState<string | null>(null);
  const activeTenantId = tenantId ?? clients[0]?.id ?? null;
  const activeClient = clients.find((c) => c.id === activeTenantId) ?? null;

  const [view, setView] = useState<SetterView>(initialSetterView);
  const selectView = (v: SetterView) => {
    setView(v);
    try {
      window.localStorage.setItem(SETTER_VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // Pipeline data is only fetched while the Pipeline tab is open. These are live
  // CRM calls per client; a setter reading the inbox or the calendar has no use
  // for them and should not be paying for them.
  const boardEnabled = view === "board" && !!activeTenantId;

  const pipelinesQuery = useSetterPipelinesQuery(activeTenantId ?? "", boardEnabled);
  // Ordered by the agency's numeric prefix in the CRM names; the switcher
  // strips the numbers from its labels, so the order has to be enforced here
  // rather than trusted to however the CRM returns them.
  const pipelines = orderByNumberPrefix(pipelinesQuery.data?.pipelines ?? []);
  // The client's CRM location, used by the cockpit to link a lead to its
  // contact record so the setter dials from the client's business number.
  const locationId = pipelinesQuery.data?.locationId ?? "";

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const activePipelineId = pipelineId ?? pipelines[0]?.id ?? null;
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  // Contacts whose stage-action automation is still running in the CRM.
  // Their cards render greyed and unclickable so a setter cannot stack a
  // second action onto a lead mid-automation. While any lock is alive the
  // board polls fast so the lock can see the stage move and release.
  const [locks, setLocks] = useState<AutomationLock[]>([]);

  const leadsQuery = useSetterLeadsQuery(
    activeTenantId ?? "",
    activePipelineId ?? "",
    boardEnabled && !!activePipelineId,
    locks.length > 0 ? 5_000 : false,
  );

  // Re-evaluate locks on every fresh board read AND on a local interval:
  // react-query's structural sharing keeps the same data reference when the
  // board did not change, so without the interval the 90s expiry would
  // never fire for an automation that makes no visible board change.
  // resolveLocks returns the same reference when nothing released, so the
  // setState is a no-op re-render in the common case.
  const boardLeads = leadsQuery.data?.leads;
  useEffect(() => {
    if (!boardLeads || locks.length === 0) return;
    const check = () => setLocks((prev) => resolveLocks(prev, boardLeads, Date.now()));
    check();
    const id = window.setInterval(check, 5_000);
    return () => window.clearInterval(id);
  }, [boardLeads, locks.length]);

  // Appointment tracking (setterApptConfirm.ts): leads in an "Appt Booked"
  // stage need the manual-confirm alert, and leads in "Appt Confirmed" need
  // their booking for the on-call reschedule/cancel actions. Booked events
  // are fetched only while such a lead is on the board, and joined to leads
  // by contactId. The range bounds are floored to the hour so the query key
  // does not churn a refetch every render.
  const now = useNow();
  const apptLeads = (boardLeads ?? []).filter((l) => isApptTrackedStage(l.stageName));
  const HOUR_MS = 60 * 60 * 1000;
  const rangeAnchor = Math.floor(now / HOUR_MS) * HOUR_MS;
  const eventsQuery = useSetterEventsQuery(
    activeTenantId ?? "",
    new Date(rangeAnchor - 7 * 24 * HOUR_MS).toISOString(),
    new Date(rangeAnchor + 30 * 24 * HOUR_MS).toISOString(),
    boardEnabled && apptLeads.length > 0,
  );
  const boardEvents = eventsQuery.data?.events;
  const apptByContact = useMemo(() => {
    const m = new Map<string, LeadAppointment>();
    if (!boardEvents) return m;
    for (const l of apptLeads) {
      if (m.has(l.contactId)) continue;
      const appt = appointmentFor(l.contactId, boardEvents, now);
      if (appt) m.set(l.contactId, appt);
    }
    return m;
    // apptLeads is derived per render; its identity is not a useful dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardEvents, boardLeads, now]);

  const [selectedLead, setSelectedLead] = useState<ApiSetterLead | null>(null);
  // Session-local dial-attempt ticks, keyed contact+stage (dialCheckKey).
  // One source of truth for the cockpit's checkboxes AND the segment bar on
  // the board card; a stage move starts the new stage's ticks fresh.
  const [dialChecks, setDialChecks] = useState<Record<string, boolean[]>>({});
  // A pending "book this contact" hand-off from the cockpit; consumed once by
  // the Calendar tab (see SetterCalendar), then cleared.
  const [bookingIntent, setBookingIntent] = useState<BookingIntent | null>(null);

  const bookAppointment = (intent: BookingIntent) => {
    setBookingIntent(intent);
    selectView("calendar");
  };

  // Same hand-off shape for chat: the cockpit's chat button switches to the
  // Inbox tab with this contact's conversation opened.
  const [chatIntent, setChatIntent] = useState<{ contactId: string; name: string } | null>(null);

  const openChat = (contactId: string, name: string) => {
    setChatIntent({ contactId, name });
    selectView("inbox");
  };

  // Locks are scoped to the board being watched: switching client or
  // pipeline swaps the lead list the locks are resolved against, so they
  // are cleared rather than left to release against the wrong board.
  const selectClient = (id: string) => {
    setTenantId(id);
    setPipelineId(null);
    setSelectedLead(null);
    setLocks([]);
  };

  const selectPipeline = (id: string) => {
    setPipelineId(id);
    setSelectedLead(null);
    setLocks([]);
  };

  const selectLead = (lead: ApiSetterLead) => {
    setSelectedLead((prev) => (prev?.id === lead.id ? null : lead));
  };

  const toggleDial = (index: number) => {
    const lead = selectedLead;
    if (!lead) return;
    const key = dialCheckKey(lead.contactId, lead.stageName);
    setDialChecks((prev) => {
      const next = [...(prev[key] ?? [])];
      while (next.length <= index) next.push(false);
      next[index] = !next[index];
      return { ...prev, [key]: next };
    });
  };

  const closeCockpit = () => setSelectedLead(null);

  // The dialing script overlay, opened from the header button so it is one
  // click away on every tab.
  const [scriptOpen, setScriptOpen] = useState(false);

  // A stage-action tag just landed on the selected lead: lock its card and
  // close the cockpit, the lead now belongs to the CRM automation until the
  // board shows the result.
  const lockSelectedLead = () => {
    const lead = selectedLead;
    if (!lead) return;
    setLocks((prev) =>
      prev.some((l) => l.contactId === lead.contactId)
        ? prev
        : [...prev, lockFor(lead, Date.now())],
    );
    setSelectedLead(null);
  };

  return (
    <div className="pk-root">
      {/* One header row: title, the view tabs inline beside it, the dialing
          script one click away, and the client picker on the right. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="pk-title">Setter Suite</h1>

        <nav
          className="pk-tabs"
          style={{ margin: 0, borderBottom: "none" }}
          aria-label="Setter view"
        >
          <button
            type="button"
            className={`pk-tab${view === "board" ? " on" : ""}`}
            onClick={() => selectView("board")}
            aria-current={view === "board" ? "page" : undefined}
          >
            <LayoutGrid size={15} aria-hidden />
            Pipeline
          </button>
          <button
            type="button"
            className={`pk-tab${view === "inbox" ? " on" : ""}`}
            onClick={() => selectView("inbox")}
            aria-current={view === "inbox" ? "page" : undefined}
          >
            <MessagesSquare size={15} aria-hidden />
            Inbox
          </button>
          <button
            type="button"
            className={`pk-tab${view === "calendar" ? " on" : ""}`}
            onClick={() => selectView("calendar")}
            aria-current={view === "calendar" ? "page" : undefined}
          >
            <CalendarDays size={15} aria-hidden />
            Calendar
          </button>
          <button
            type="button"
            className={`pk-tab${view === "results" ? " on" : ""}`}
            onClick={() => selectView("results")}
            aria-current={view === "results" ? "page" : undefined}
          >
            <Trophy size={15} aria-hidden />
            Results
          </button>
          <button
            type="button"
            className={`pk-tab${view === "settings" ? " on" : ""}`}
            onClick={() => selectView("settings")}
            aria-current={view === "settings" ? "page" : undefined}
          >
            <Settings size={15} aria-hidden />
            Settings
          </button>
        </nav>

        <button
          type="button"
          onClick={() => setScriptOpen(true)}
          disabled={!activeTenantId}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
        >
          <ScrollText size={14} aria-hidden />
          Dialing script
        </button>

        {clients.length > 0 && (
          <ClientPicker clients={clients} activeId={activeTenantId} onSelect={selectClient} />
        )}
      </div>

      {clientsQuery.isLoading ? (
        <div className="pk-empty">Loading clients...</div>
      ) : clientsQuery.isError ? (
        <div className="pk-empty">Could not load clients.</div>
      ) : clients.length === 0 ? (
        <div className="pk-empty">No clients yet.</div>
      ) : !activeTenantId || !activeClient ? null : (
        <div className="mt-4">
          {view === "inbox" ? (
            <SetterInbox
              key={activeTenantId}
              tenantId={activeTenantId}
              clientName={activeClient.name}
              chatIntent={chatIntent}
              onChatHandled={() => setChatIntent(null)}
            />
          ) : view === "calendar" ? (
            // Keyed on the tenant so switching client resets the view state and
            // any half-open booking panel, rather than carrying one client's
            // slot selection onto another client's calendar.
            <SetterCalendar
              key={activeTenantId}
              tenantId={activeTenantId}
              clientName={activeClient.name}
              bookingIntent={bookingIntent}
              onBookingHandled={() => setBookingIntent(null)}
            />
          ) : view === "results" ? (
            // Keyed on the tenant so switching client never carries one
            // client's estimate lists onto another's.
            <SetterResults
              key={activeTenantId}
              tenantId={activeTenantId}
              clientName={activeClient.name}
            />
          ) : view === "settings" ? (
            // Keyed on the tenant for the same reason, and for one more: an
            // unsaved edit is flushed on unmount, so remounting per client is
            // what guarantees one client's typing never lands on another.
            <SetterSettings
              key={activeTenantId}
              tenantId={activeTenantId}
              clientName={activeClient.name}
            />
          ) : (
            <>
              <SetterScoreStrip
                tenantId={activeTenantId}
                leads={boardLeads ?? []}
                now={now}
              />
              <SetterCallbacksRail tenantId={activeTenantId} />
              {pipelines.length > 0 && activePipelineId && (
                <div className="mb-4">
                  <Segmented
                    options={pipelines.map((p) => ({
                      value: p.id,
                      label: pipelineTabLabel(p.name),
                    }))}
                    value={activePipelineId}
                    onChange={selectPipeline}
                    size="sm"
                  />
                </div>
              )}

              {pipelinesQuery.isLoading ? (
                <div className="pk-empty">Loading pipelines...</div>
              ) : pipelinesQuery.isError ? (
                <div className="pk-empty">Could not load pipelines for {activeClient.name}.</div>
              ) : !activePipeline ? (
                <div className="pk-empty">No pipelines found for {activeClient.name}.</div>
              ) : leadsQuery.isLoading ? (
                <div className="pk-empty">Loading leads...</div>
              ) : leadsQuery.isError ? (
                <div className="pk-empty">Could not load leads for {activePipeline.name}.</div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <SetterBoard
                      pipeline={activePipeline}
                      leads={leadsQuery.data?.leads ?? []}
                      truncated={leadsQuery.data?.truncated ?? false}
                      now={now}
                      selectedLeadId={selectedLead?.id ?? null}
                      lockedContactIds={lockedContactIds(locks)}
                      dialChecks={dialChecks}
                      appointments={apptByContact}
                      onSelectLead={selectLead}
                    />
                  </div>
                  {selectedLead && activeTenantId && (
                    <SetterCockpit
                      key={selectedLead.id}
                      tenantId={activeTenantId}
                      pipelineId={activePipelineId ?? ""}
                      pipelineName={activePipeline.name}
                      locationId={locationId}
                      lead={selectedLead}
                      onClose={closeCockpit}
                      onBookAppointment={bookAppointment}
                      onOpenChat={openChat}
                      onAutomationStart={lockSelectedLead}
                      dialed={
                        dialChecks[dialCheckKey(selectedLead.contactId, selectedLead.stageName)] ??
                        []
                      }
                      onToggleDial={toggleDial}
                      appointment={apptByContact.get(selectedLead.contactId) ?? null}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {scriptOpen && activeTenantId && (
        <SetterScriptOverlay
          tenantId={activeTenantId}
          clientName={activeClient?.name ?? ""}
          onClose={() => setScriptOpen(false)}
        />
      )}
    </div>
  );
}
