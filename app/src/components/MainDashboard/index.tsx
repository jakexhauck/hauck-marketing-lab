import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./main-dashboard.css";
import { AppSidebar } from "./AppSidebar";
import type { WorkflowView } from "./Sidebar";
import type { FormSurfaceId } from "../../lib/formConfigs";
import {
  IconBell,
  IconPlus,
  IconSettings,
  IconTarget,
  IconTasks,
  IconUser,
} from "../icons";
import type {
  ClientSection,
  OutreachSection,
  ProspectEntry,
  WorkspaceView,
} from "../../lib/navigation";
import { ConnectCalendarModal } from "./ConnectCalendarModal";
import { TasksNotes } from "./TasksNotes";
import { RecordingsPage } from "./RecordingsPage";
import { SOPsPage } from "./SOPsPage";
import { CalendarPage } from "./CalendarPage";
import { LeadScraperPage } from "./LeadScraperPage";
import { WebDesignerPage } from "./WebDesignerPage";
import { ClientDashboard } from "./ClientDashboard";
import { OutreachHub } from "./OutreachHub";
import { OutreachProspectPage } from "./OutreachProspectPage";
import type { CalendarConnection, ClientEntry, DashboardState } from "../../lib/types";
import { api } from "../../lib/tauri";
import { eventsOn, fetchCalendarEvents, type GCalEvent } from "../../lib/googleCalendar";

interface MainDashboardProps {
  onOpenMediaBuying: () => void;
  /** Real clients loaded from disk. Empty array means no clients on file. */
  clients?: ClientEntry[] | null;
  /** Selected media-buying folder root; required for backend calls from sub-pages. */
  root?: string | null;
  /** Currently active client slug — used by workflows that operate per-client. */
  activeClientSlug?: string | null;
  onSync?: () => void;
  syncing?: boolean;
  syncStatus?: "idle" | "ok" | "error";
  syncTooltip?: string;
  onSettings?: () => void;
  onAddClient?: () => void;
  onManageClients?: () => void;
  /** Legacy: if provided, route the named workflow into outreach. */
  initialWorkflow?: WorkflowView | null;
  onInitialWorkflowApplied?: () => void;
  /** Open a form generator overlay scoped to a client. */
  onOpenForm?: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
  /** Switch the active client (persists slug). Called when the user clicks a
   *  client section in the sidebar so prompt context follows. */
  onSwitchClient?: (slug: string) => void;
}

type View =
  | { kind: "dashboard" }
  | { kind: "workspace"; tab: Exclude<WorkspaceView, "dashboard"> }
  | { kind: "outreach"; section: OutreachSection; prospectSlug?: string }
  | { kind: "client"; slug: string; section: ClientSection };

function initialViewFromWorkflow(w: WorkflowView | null | undefined): View {
  if (w === "lead-scraper") return { kind: "outreach", section: "lead-scraper" };
  if (w === "web-designer") return { kind: "outreach", section: "web-designer" };
  return { kind: "dashboard" };
}

export function MainDashboard({
  onOpenMediaBuying: _onOpenMediaBuying,
  clients,
  root,
  activeClientSlug,
  onSync,
  syncing,
  syncStatus,
  syncTooltip,
  onSettings,
  onAddClient,
  onManageClients: _onManageClients,
  initialWorkflow,
  onInitialWorkflowApplied,
  onOpenForm,
  onSwitchClient,
}: MainDashboardProps) {
  const [view, setView] = useState<View>(initialViewFromWorkflow(initialWorkflow));

  useEffect(() => {
    if (initialWorkflow) {
      setView(initialViewFromWorkflow(initialWorkflow));
      onInitialWorkflowApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkflow]);

  const realClients: ClientEntry[] = clients ?? [];

  // Prospects (greenfield) — placeholder; backed by `list_prospects` once the
  // Rust command lands. For now we read nothing and the sidebar's Prospects
  // subtree simply hides.
  const [prospects, setProspects] = useState<ProspectEntry[]>([]);
  useEffect(() => {
    if (!root) {
      setProspects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProspects?.(root);
        if (cancelled || !list) return;
        setProspects(list);
      } catch {
        if (!cancelled) setProspects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root]);

  const activeClient: ClientEntry | null = useMemo(() => {
    if (view.kind !== "client") return null;
    return realClients.find((c) => c.slug === view.slug) ?? null;
  }, [view, realClients]);

  const activeProspect: ProspectEntry | null = useMemo(() => {
    if (view.kind !== "outreach" || view.section !== "prospect") return null;
    return prospects.find((p) => p.slug === view.prospectSlug) ?? null;
  }, [view, prospects]);

  const goDashboard = () => setView({ kind: "dashboard" });

  const onSelectWorkspace = (tab: WorkspaceView) => {
    if (tab === "dashboard") {
      goDashboard();
    } else {
      setView({ kind: "workspace", tab });
    }
  };

  const onSelectOutreachSection = (
    section: "overview" | "lead-scraper" | "web-designer",
  ) => {
    setView({ kind: "outreach", section });
  };

  const onSelectProspect = (slug: string) => {
    setView({ kind: "outreach", section: "prospect", prospectSlug: slug });
  };

  const onSelectClientSection = (slug: string, section: ClientSection) => {
    setView({ kind: "client", slug, section });
    // Sync active client so prompt + form context follows.
    if (activeClientSlug !== slug) {
      onSwitchClient?.(slug);
    }
  };

  // Sidebar active-state derivations ─────────────────────────
  const activeWorkspace: WorkspaceView | null =
    view.kind === "dashboard"
      ? "dashboard"
      : view.kind === "workspace"
        ? view.tab
        : null;

  const activeOutreach: OutreachSection | null =
    view.kind === "outreach" ? view.section : null;

  const activeProspectSlug: string | null =
    view.kind === "outreach" && view.section === "prospect"
      ? view.prospectSlug ?? null
      : null;

  const activeClientForSidebar:
    | { slug: string; section: ClientSection }
    | null =
    view.kind === "client"
      ? { slug: view.slug, section: view.section }
      : null;

  // Topbar breadcrumb ─────────────────────────────────────────
  const breadcrumb = useMemo(() => buildBreadcrumb(view, realClients, prospects), [
    view,
    realClients,
    prospects,
  ]);

  const syncLabel = syncing
    ? "⇅ Syncing…"
    : syncStatus === "ok"
      ? "⇅ Synced"
      : syncStatus === "error"
        ? "⇅ Sync"
        : "⇅ Sync";

  return (
    <div className="md-root hml-app">
      <div className="hml-shell">
        <AppSidebar
          activeWorkspace={activeWorkspace}
          activeOutreach={activeOutreach}
          activeProspectSlug={activeProspectSlug}
          activeClient={activeClientForSidebar}
          clients={realClients}
          prospects={prospects}
          onSelectWorkspace={onSelectWorkspace}
          onSelectOutreachSection={onSelectOutreachSection}
          onSelectProspect={onSelectProspect}
          onSelectClientSection={onSelectClientSection}
          onAddClient={onAddClient}
          onOpenSettings={onSettings}
          onBrandClick={goDashboard}
          appVersion="v1.4"
        />
        <main className="hml-main">
          <header className="hml-topbar">
            <div className="hml-breadcrumb">{breadcrumb}</div>
            <div className="hml-topbar-right">
              <span className="hml-topbar-clock">{currentClockLabel()}</span>
              {onSync && (
                <button
                  type="button"
                  className={`hml-btn hml-ghost${syncing ? " hml-syncing" : ""}`}
                  onClick={onSync}
                  disabled={syncing}
                  title={syncTooltip || "Sync with GitHub"}
                  style={{ fontSize: 11.5, padding: "5px 10px" }}
                >
                  {syncLabel}
                </button>
              )}
              <button type="button" className="hml-icon-btn" title="Notifications">
                <IconBell size={15} />
              </button>
              {onSettings && (
                <button
                  type="button"
                  className="hml-icon-btn"
                  onClick={onSettings}
                  title="Settings"
                >
                  <IconSettings size={15} />
                </button>
              )}
              <button type="button" className="hml-btn" title="New">
                <IconPlus size={13} />
                New
              </button>
            </div>
          </header>
          {renderMain({
            view,
            onBack: goDashboard,
            realClients,
            root: root ?? null,
            activeClientSlug: activeClientSlug ?? null,
            prospects,
            activeClient,
            activeProspect,
            onSelectOutreachSection,
            onSelectProspect,
            onSelectClientSection,
            onOpenForm,
          })}
        </main>
      </div>
    </div>
  );
}

function buildBreadcrumb(
  view: View,
  clients: ClientEntry[],
  prospects: ProspectEntry[],
): React.ReactNode {
  if (view.kind === "dashboard") {
    return (
      <>
        <span className="hml-seg">Workspace</span>
        <span className="hml-sep">/</span>
        <span className="hml-current">Dashboard</span>
      </>
    );
  }
  if (view.kind === "workspace") {
    const label = view.tab.charAt(0).toUpperCase() + view.tab.slice(1);
    return (
      <>
        <span className="hml-seg">Workspace</span>
        <span className="hml-sep">/</span>
        <span className="hml-current">{label}</span>
      </>
    );
  }
  if (view.kind === "outreach") {
    if (view.section === "overview") {
      return (
        <>
          <span className="hml-seg">Outreach</span>
          <span className="hml-sep">/</span>
          <span className="hml-current">Overview</span>
        </>
      );
    }
    if (view.section === "prospect") {
      const p = prospects.find((p) => p.slug === view.prospectSlug);
      return (
        <>
          <span className="hml-seg">Outreach</span>
          <span className="hml-sep">/</span>
          <span className="hml-current">{p?.name ?? view.prospectSlug ?? "Prospect"}</span>
        </>
      );
    }
    const label =
      view.section === "lead-scraper" ? "Lead Scraper" : "Web Designer";
    return (
      <>
        <span className="hml-seg">Outreach</span>
        <span className="hml-sep">/</span>
        <span className="hml-current">{label}</span>
      </>
    );
  }
  // client
  const c = clients.find((c) => c.slug === view.slug);
  const sectionLabel = sectionToLabel(view.section);
  return (
    <>
      <span className="hml-seg">Clients</span>
      <span className="hml-sep">/</span>
      <span className="hml-seg">{c?.name ?? view.slug}</span>
      <span className="hml-sep">/</span>
      <span className="hml-current">{sectionLabel}</span>
    </>
  );
}

function sectionToLabel(s: ClientSection): string {
  switch (s) {
    case "profile":
      return "Profile";
    case "memory":
      return "Memory";
    case "drive":
      return "Drive";
    case "media-buying":
      return "Media Buying";
    case "website":
      return "Website";
  }
}

function currentClockLabel(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const date = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${weekday} · ${date} · ${time}`;
}

interface RenderMainArgs {
  view: View;
  onBack: () => void;
  realClients: ClientEntry[];
  root: string | null;
  activeClientSlug: string | null;
  prospects: ProspectEntry[];
  activeClient: ClientEntry | null;
  activeProspect: ProspectEntry | null;
  onSelectOutreachSection: (
    section: "overview" | "lead-scraper" | "web-designer",
  ) => void;
  onSelectProspect: (slug: string) => void;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onOpenForm?: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
}

function renderMain(args: RenderMainArgs): React.ReactNode {
  const {
    view,
    realClients,
    root,
    activeClientSlug,
    prospects,
    activeClient,
    activeProspect,
    onSelectOutreachSection,
    onSelectProspect,
    onSelectClientSection,
  } = args;

  if (view.kind === "dashboard") {
    return <DashboardSurface clientCount={realClients.length} root={root} />;
  }

  if (view.kind === "workspace") {
    if (view.tab === "tasks") return <TasksNotes root={root} />;
    if (view.tab === "recordings") return <RecordingsPage root={root} />;
    if (view.tab === "sops") return <SOPsPage root={root} />;
    if (view.tab === "calendar") return <CalendarPage root={root} onBack={args.onBack} />;
    return null;
  }

  if (view.kind === "outreach") {
    if (view.section === "overview") {
      return (
        <OutreachHub
          prospects={prospects}
          onSelectSection={onSelectOutreachSection}
          onSelectProspect={onSelectProspect}
        />
      );
    }
    if (view.section === "lead-scraper") {
      return <LeadScraperPage root={root} />;
    }
    if (view.section === "web-designer") {
      // Revamp mode for an outreach prospect (none selected here — picker UI
      // lives inside the page).
      return (
        <WebDesignerPage
          root={root}
          clientSlug={activeClientSlug ?? "willis-windows"}
          clientName={activeClient?.name ?? "Willis Windows"}
        />
      );
    }
    if (view.section === "prospect" && activeProspect) {
      return <OutreachProspectPage prospect={activeProspect} />;
    }
    return null;
  }

  // kind: "client"
  const c =
    activeClient ??
    realClients.find((c) => c.slug === view.slug) ?? {
      slug: view.slug,
      name: view.slug,
      status: "pre-launch" as const,
    };
  return (
    <ClientDashboard
      client={c}
      section={view.section}
      root={root}
      onSelectSection={(section) => onSelectClientSection(c.slug, section)}
      onOpenForm={
        args.onOpenForm ?? (() => undefined)
      }
      onOpenDrive={
        c.drive_folder_url
          ? () => {
              window.open(c.drive_folder_url!, "_blank", "noreferrer");
            }
          : undefined
      }
    />
  );
}

function greetingForHour(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function DashboardSurface({
  clientCount,
  root,
}: {
  clientCount: number;
  root: string | null;
}) {
  const now = new Date();
  const hour = now.getHours();
  const greeting = greetingForHour(hour);
  const eyebrow = now
    .toLocaleDateString(undefined, { weekday: "long" })
    .toLocaleUpperCase();
  const stamp = now
    .toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

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
        recordings: current.recordings ?? [],
      };
      await api.writeDashboardState(root, nextState);
      if (!mountedRef.current) return;
      setConnection(nextConn);
      setModalOpen(false);
      await loadEventsFor(nextConn);
    },
    [root, loadEventsFor],
  );

  const todayEvents = eventsOn(events, new Date());

  return (
    <div className="hml-content">
      {/* Greeting card ──────────────────────────────────────── */}
      <section className="hml-greeting">
        <div className="hml-greeting-eyebrow">
          <span className="hml-eyebrow-dot" />
          {eyebrow}
        </div>
        <h1 className="hml-greeting-title">
          {greeting}, Sir.
        </h1>
        <div className="hml-greeting-sub">
          {clientCount} active client{clientCount === 1 ? "" : "s"}.
          {todayEvents.length > 0
            ? ` ${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"} on the calendar today.`
            : " No events on the calendar today."}
          <span className="hml-divider" />
          <span className="hml-mono">{stamp}</span>
        </div>
      </section>

      {/* Stat row ──────────────────────────────────────────── */}
      <section className="hml-stat-row">
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconUser className="hml-icon" />
            Active Clients
          </div>
          <div className="hml-stat-value">
            {clientCount}
            <span className="hml-stat-delta hml-flat">— stable</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconTarget className="hml-icon" />
            Open Prospects
          </div>
          <div className="hml-stat-value">
            0
            <span className="hml-stat-delta hml-flat">— scraper idle</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconTasks className="hml-icon" />
            Events Today
          </div>
          <div className="hml-stat-value">
            {todayEvents.length}
            {todayEvents.length > 0 ? (
              <span className="hml-stat-delta hml-warn">on calendar</span>
            ) : (
              <span className="hml-stat-delta hml-flat">— clear</span>
            )}
          </div>
        </div>
      </section>

      {fetchError && connection ? (
        <div
          className="hml-panel"
          style={{
            padding: "12px 18px",
            color: "var(--hml-red)",
            fontSize: 13,
            marginBottom: 20,
            borderColor: "var(--hml-red-border)",
            background: "var(--hml-red-bg)",
          }}
        >
          Calendar fetch failed — try Reconnect.
        </div>
      ) : null}

      {/* Two-col: activity feed + today calendar ───────────── */}
      <section className="hml-col-2">
        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Recent activity
            </div>
            <span className="hml-panel-action">View all</span>
          </div>
          <div className="hml-panel-body">
            <div className="hml-empty">
              <div className="hml-empty-title">No activity logged yet</div>
              <div className="hml-empty-sub">
                Run a form, generate a website, or scrape leads — the feed
                fills as you work.
              </div>
            </div>
          </div>
        </div>

        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
              Today
            </div>
            {!connection ? (
              <button
                type="button"
                className="hml-panel-action"
                onClick={() => setModalOpen(true)}
              >
                Connect →
              </button>
            ) : (
              <span className="hml-panel-action">
                {connection.label ?? "Calendar"}
              </span>
            )}
          </div>
          <div className="hml-panel-body">
            {!connection ? (
              <div className="hml-empty">
                <div className="hml-empty-title">No calendar connected</div>
                <div className="hml-empty-sub">
                  Hook up a Google Calendar to see today at a glance.
                </div>
              </div>
            ) : todayEvents.length === 0 ? (
              <div className="hml-cal-empty">No events on today's calendar.</div>
            ) : (
              <div className="hml-cal-day">
                <div className="hml-cal-day-label">
                  <span>{stamp}</span>
                  <span className="hml-dim">
                    {todayEvents.length} event{todayEvents.length === 1 ? "" : "s"}
                  </span>
                </div>
                {todayEvents.map((evt, i) => {
                  const start = evt.start ? new Date(evt.start) : null;
                  const time = start
                    ? start.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  const past = start ? start.getTime() < Date.now() : false;
                  return (
                    <div className="hml-cal-event" key={i}>
                      <div className={`hml-cal-event-time${past ? " hml-past" : ""}`}>
                        {time}
                      </div>
                      <div className="hml-cal-event-body">
                        <div
                          className={`hml-cal-event-title${past ? " hml-past" : ""}`}
                        >
                          {evt.title ?? "(untitled)"}
                        </div>
                        <div className="hml-cal-event-meta">
                          {evt.location ?? ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <ConnectCalendarModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveConnection}
      />
    </div>
  );
}
