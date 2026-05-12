import { useCallback, useEffect, useRef, useState } from "react";
import "./main-dashboard.css";
import { TopBar } from "./TopBar";
import { Sidebar, type WorkflowView, type WorkspaceView } from "./Sidebar";
import type { ClientSection } from "./ClientTree";
import { GreetingCard } from "./GreetingCard";
import { MiniStats } from "./MiniStats";
import { BookedToday } from "./BookedToday";
import { CalendarWidget } from "./CalendarWidget";
import { ConnectCalendarModal } from "./ConnectCalendarModal";
import { TasksNotes } from "./TasksNotes";
import { CalendarPage } from "./CalendarPage";
import { ClientOverview } from "./pages/ClientOverview";
import { ClientContract } from "./pages/ClientContract";
import { ClientResources } from "./pages/ClientResources";
import { ClientCampaigns } from "./pages/ClientCampaigns";
import { ClientInvoices } from "./pages/ClientInvoices";
import type { CalendarConnection, ClientEntry, DashboardState } from "../../lib/types";
import { api } from "../../lib/tauri";
import { eventsOn, fetchCalendarEvents, type GCalEvent } from "../../lib/googleCalendar";

interface MainDashboardProps {
  onOpenMediaBuying: () => void;
  /** Real clients loaded from disk. Empty array means no clients on file. */
  clients?: ClientEntry[] | null;
  /** Selected media-buying folder root; required for backend calls from sub-pages. */
  root?: string | null;
  onSync?: () => void;
  syncing?: boolean;
  syncStatus?: "idle" | "ok" | "error";
  syncTooltip?: string;
  onSettings?: () => void;
}

type View =
  | { kind: "dashboard" }
  | { kind: "workspace"; tab: WorkspaceView }
  | { kind: "client"; slug: string; section: ClientSection };

export function MainDashboard({
  onOpenMediaBuying,
  clients,
  root,
  onSync,
  syncing,
  syncStatus,
  syncTooltip,
  onSettings,
}: MainDashboardProps) {
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const realClients: ClientEntry[] = clients ?? [];

  const goDashboard = () => setView({ kind: "dashboard" });

  const onSelectWorkspace = (tab: WorkspaceView) => {
    if (tab === "dashboard") {
      goDashboard();
    } else {
      setView({ kind: "workspace", tab });
    }
  };

  const onSelectClientSection = (slug: string, section: ClientSection) => {
    setView({ kind: "client", slug, section });
  };

  const onSelectWorkflow = (tab: WorkflowView) => {
    if (tab === "media-buying") {
      onOpenMediaBuying();
      return;
    }
  };

  const activeWorkspace: WorkspaceView | null =
    view.kind === "dashboard"
      ? "dashboard"
      : view.kind === "workspace"
        ? view.tab
        : null;

  return (
    <div className="md-root">
      <TopBar
        onBrandClick={goDashboard}
        onSync={onSync}
        syncing={syncing}
        syncStatus={syncStatus}
        syncTooltip={syncTooltip}
        onSettings={onSettings}
      />
      <div className="md-shell">
        <Sidebar
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onSelectClientSection={onSelectClientSection}
          onSelectWorkflow={onSelectWorkflow}
          clients={realClients}
        />
        <main className="md-main">{renderMain(view, goDashboard, realClients, root ?? null)}</main>
      </div>
    </div>
  );
}

function renderMain(
  view: View,
  onBack: () => void,
  realClients: ClientEntry[],
  root: string | null,
) {
  if (view.kind === "dashboard") {
    return <DashboardSurface clientCount={realClients.length} root={root} />;
  }
  if (view.kind === "workspace") {
    if (view.tab === "tasks") {
      return (
        <div className="md-placeholder" style={{ padding: 0 }}>
          <button type="button" className="md-back" onClick={onBack}>
            ◂ Back to dashboard
          </button>
          <TasksNotes root={root} />
        </div>
      );
    }
    if (view.tab === "calendar") {
      return <CalendarPage root={root} onBack={onBack} />;
    }
    return (
      <div className="md-placeholder">
        <button type="button" className="md-back" onClick={onBack}>
          ◂ Back to dashboard
        </button>
        <div>
          <span className="md-tag">▸ NOT WIRED</span>
          Workspace
        </div>
      </div>
    );
  }
  // client section
  const realEntry = realClients.find((c) => c.slug === view.slug) ?? null;
  const clientName = realEntry?.name ?? view.slug;
  switch (view.section) {
    case "overview":
      return (
        <ClientOverview
          clientName={clientName}
          clientSlug={view.slug}
          client={realEntry}
          root={root}
          onBack={onBack}
        />
      );
    case "contract":
      return <ClientContract clientName={clientName} onBack={onBack} />;
    case "resources":
      return <ClientResources clientName={clientName} onBack={onBack} />;
    case "campaigns":
      return <ClientCampaigns clientName={clientName} onBack={onBack} />;
    case "invoices":
      return <ClientInvoices clientName={clientName} onBack={onBack} />;
  }
}

function DashboardSurface({
  clientCount,
  root,
}: {
  clientCount: number;
  root: string | null;
}) {
  const now = new Date();
  const weekday = now
    .toLocaleDateString(undefined, { weekday: "long" })
    .toUpperCase();
  const date = now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadEventsFor = useCallback(async (conn: CalendarConnection | null) => {
    if (!conn) {
      setEvents([]);
      setFetchError(null);
      return;
    }
    try {
      const parsed = await fetchCalendarEvents(conn);
      if (!mountedRef.current) return;
      setEvents(parsed);
      setFetchError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setEvents([]);
      setFetchError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!root) return;
    try {
      const state = await api.readDashboardState(root);
      if (!mountedRef.current) return;
      const conn = state.calendar ?? null;
      setConnection(conn);
      await loadEventsFor(conn);
    } catch (err) {
      if (!mountedRef.current) return;
      setFetchError(err instanceof Error ? err.message : String(err));
    }
  }, [root, loadEventsFor]);

  useEffect(() => {
    if (!root) {
      setConnection(null);
      setEvents([]);
      setFetchError(null);
      return;
    }
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 10 * 60 * 1000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [root, refresh]);

  const handleSaveConnection = useCallback(
    async (apiKey: string, calendarId: string, label: string) => {
      if (!root) {
        throw new Error("No media-buying folder selected — pick a folder first.");
      }
      const current: DashboardState = await api.readDashboardState(root);
      const nextConn: CalendarConnection = {
        apiKey,
        calendarId,
        label,
        connectedAt: new Date().toISOString(),
      };
      const nextState: DashboardState = {
        tasks: current.tasks ?? [],
        notes: current.notes ?? [],
        calendar: nextConn,
      };
      await api.writeDashboardState(root, nextState);
      if (!mountedRef.current) return;
      setConnection(nextConn);
      setModalOpen(false);
      await loadEventsFor(nextConn);
    },
    [root, loadEventsFor],
  );

  const handleDisconnect = useCallback(async () => {
    if (!root) {
      setConnection(null);
      setEvents([]);
      return;
    }
    try {
      const current: DashboardState = await api.readDashboardState(root);
      const nextState: DashboardState = {
        tasks: current.tasks ?? [],
        notes: current.notes ?? [],
        calendar: null,
      };
      await api.writeDashboardState(root, nextState);
      if (!mountedRef.current) return;
      setConnection(null);
      setEvents([]);
      setFetchError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setFetchError(err instanceof Error ? err.message : String(err));
    }
  }, [root]);

  const todayEvents = eventsOn(events, new Date());

  return (
    <>
      <section className="md-page-head md-reveal md-reveal-1">
        <div className="md-page-head-left">
          <span className="md-page-head-eyebrow">▸ Dashboard</span>
          <h1>
            Good morning, <span className="md-copper-text">Sir.</span>
          </h1>
        </div>
        <div className="md-date">
          {weekday}
          <br />
          {date} · {time}
        </div>
      </section>

      <GreetingCard clientCount={clientCount} />
      <MiniStats clientCount={clientCount} eventsToday={todayEvents.length} />

      {fetchError && connection ? (
        <div className="md-cal-error-chip md-reveal md-reveal-3">
          Calendar fetch failed — try Reconnect.
        </div>
      ) : null}

      <section className="md-split md-reveal md-reveal-4">
        <BookedToday events={todayEvents} />
        <CalendarWidget
          connection={connection}
          events={events}
          onConnect={() => setModalOpen(true)}
          onDisconnect={() => void handleDisconnect()}
        />
      </section>

      <ConnectCalendarModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveConnection}
      />
    </>
  );
}
