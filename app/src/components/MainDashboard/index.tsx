import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./main-dashboard.css";
import { openInAppWindow } from "../../lib/openInApp";
import { AppSidebar } from "./AppSidebar";
import { IconRail } from "./IconRail";
import type { WorkflowView } from "./Sidebar";
import type { FormSurfaceId } from "../../lib/formConfigs";
import type { AgentSummary } from "../../lib/types";
import {
  IconPlus,
  IconTarget,
  IconTasks,
  IconUser,
} from "../icons";
import {
  subAppToDefaultView,
  viewToSubApp,
  type ClientSection,
  type OutreachSection,
  type PersonalSection,
  type ProspectEntry,
  type SubApp,
  type WorkspaceView,
} from "../../lib/navigation";
import { ConnectCalendarModal } from "./ConnectCalendarModal";
import { AutomationsPage } from "./AutomationsPage";
import { CreativeStudio } from "./CreativeStudio";
import { RecordingsPage } from "./RecordingsPage";
import { ResourcesPage } from "./ResourcesPage";
import { SOPsPage } from "./SOPsPage";
import { CalendarPage } from "./CalendarPage";
import { LeadScraperPage } from "./LeadScraperPage";
import { NotificationsBell } from "./NotificationsBell";
import { WebDesignerPage } from "./WebDesignerPage";
import { ClientDashboard } from "./ClientDashboard";
import { ClientsLanding } from "./ClientsLanding";
import { OutreachHub } from "./OutreachHub";
import { OutreachDmsPage } from "./OutreachDmsPage";
import { OutreachProspectPage } from "./OutreachProspectPage";
import { OutreachSequencePage } from "./OutreachSequencePage";
import { SalesHubPage } from "./SalesHubPage";
import { OnboardingHubPage } from "./OnboardingHubPage";
import { PersonalHubPage } from "./PersonalHubPage";
import {
  RevenueTrackerPage,
  TasksTrackerPage,
  mondayYMD,
  todayDow,
  todayYMD,
} from "./OpsTrackers";
import type {
  CalendarConnection,
  ClientEntry,
  DashboardState,
  OpsTask,
  OpsTasksFile,
} from "../../lib/types";
import { api } from "../../lib/tauri";
import { eventsOn, fetchCalendarEvents, type GCalEvent } from "../../lib/googleCalendar";
import {
  loadAppointmentEvents,
  mergeEvents,
  runSync as runGhlCalendarSync,
  SYNC_EVENT as GHL_SYNC_EVENT,
} from "../../lib/ghlCalendarSync";

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
  /** Agent summaries. Needed by per-client surfaces that embed
   *  GenericFormGenerator (e.g. the Media Buying Sequence tab). */
  agents?: AgentSummary[];
}

type View =
  | { kind: "workspace"; tab: WorkspaceView }
  | { kind: "outreach"; section: OutreachSection; prospectSlug?: string }
  | { kind: "client"; slug: string; section: ClientSection }
  | { kind: "personal"; section: PersonalSection };

function initialViewFromWorkflow(w: WorkflowView | null | undefined): View {
  if (w === "lead-scraper") return { kind: "outreach", section: "lead-scraper" };
  if (w === "web-designer") return { kind: "outreach", section: "web-designer" };
  return { kind: "workspace", tab: "dashboard" };
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
  agents,
}: MainDashboardProps) {
  const [view, setView] = useState<View>(initialViewFromWorkflow(initialWorkflow));

  useEffect(() => {
    if (initialWorkflow) {
      setView(initialViewFromWorkflow(initialWorkflow));
      onInitialWorkflowApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkflow]);

  // GHL calendar → HML sync. Runs on app open, on visibility-change to
  // visible, and every 90s while the app is foregrounded. No-ops if GHL,
  // the booking calendar, or the sales pipeline isn't set up yet.
  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        await runGhlCalendarSync(root);
      } catch {
        // Swallow — runSync already returns a structured error result.
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const interval = window.setInterval(tick, 90_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [root]);

  const realClients: ClientEntry[] = clients ?? [];

  // Prospects (backed by vault/Outreach/<slug>/profile.md via list_prospects).
  const [prospects, setProspects] = useState<ProspectEntry[]>([]);
  const refreshProspects = useCallback(async () => {
    if (!root) {
      setProspects([]);
      return;
    }
    try {
      const list = await api.listProspects?.(root);
      if (!list) return;
      setProspects(list);
    } catch {
      setProspects([]);
    }
  }, [root]);

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

  const onSelectWorkspace = (tab: WorkspaceView) => {
    setView({ kind: "workspace", tab });
  };

  /** Brand click / "back" target. Lands on the Dashboard. */
  const goHome = () => setView({ kind: "workspace", tab: "dashboard" });

  const onSelectOutreachSection = (
    section: "overview" | "lead-scraper" | "web-designer" | "sequence" | "dms",
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

  const onSelectPersonalSection = (section: PersonalSection) => {
    setView({ kind: "personal", section });
  };

  const currentSubApp: SubApp = viewToSubApp(view);

  const onPickSubApp = (subApp: SubApp) => {
    if (subApp === "settings") {
      onSettings?.();
      return;
    }
    const next = subAppToDefaultView(subApp);
    if (next) setView(next as View);
  };

  // Sidebar active-state derivations ─────────────────────────
  const activeWorkspace: WorkspaceView | null =
    view.kind === "workspace" ? view.tab : null;

  const activeOutreach: OutreachSection | null =
    view.kind === "outreach" ? view.section : null;

  const activeClientForSidebar:
    | { slug: string; section: ClientSection }
    | null =
    view.kind === "client"
      ? { slug: view.slug, section: view.section }
      : null;

  const activePersonal: PersonalSection | null =
    view.kind === "personal" ? view.section : null;

  // Topbar breadcrumb ─────────────────────────────────────────
  const onBreadcrumbBack = useCallback(() => {
    if (view.kind === "workspace") {
      goHome();
      return;
    }
    if (view.kind === "outreach") {
      setView({ kind: "outreach", section: "overview" });
      return;
    }
    if (view.kind === "personal") {
      setView({ kind: "personal", section: "overview" });
      return;
    }
    if (view.kind === "client") {
      setView({ kind: "workspace", tab: "clients" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const breadcrumb = useMemo(
    () => buildBreadcrumb(view, realClients, prospects, onBreadcrumbBack),
    [view, realClients, prospects, onBreadcrumbBack],
  );

  const syncLabel = syncing
    ? "⇅ Syncing…"
    : syncStatus === "ok"
      ? "⇅ Synced"
      : syncStatus === "error"
        ? "⇅ Sync"
        : "⇅ Sync";

  const shellClass =
    "hml-shell" + (currentSubApp === "dashboard" ? " hml-shell-no-sidebar" : "");

  return (
    <div className="md-root hml-app">
      <div className={shellClass}>
        <IconRail current={currentSubApp} onPick={onPickSubApp} />
        <AppSidebar
          currentSubApp={currentSubApp}
          activeWorkspace={activeWorkspace}
          activeOutreach={activeOutreach}
          activeClient={activeClientForSidebar}
          activePersonal={activePersonal}
          clients={realClients}
          prospects={prospects}
          onSelectWorkspace={onSelectWorkspace}
          onSelectOutreachSection={onSelectOutreachSection}
          onSelectClientSection={onSelectClientSection}
          onSelectPersonalSection={onSelectPersonalSection}
          onAddClient={onAddClient}
          onBrandClick={goHome}
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
              <NotificationsBell root={root ?? null} />
              <button type="button" className="hml-btn" title="New">
                <IconPlus size={13} />
                New
              </button>
            </div>
          </header>
          {renderMain({
            view,
            onBack: goHome,
            realClients,
            root: root ?? null,
            activeClientSlug: activeClientSlug ?? null,
            prospects,
            activeClient,
            activeProspect,
            onSelectOutreachSection,
            onSelectProspect,
            onSelectClientSection,
            onSelectPersonalSection,
            onOpenForm,
            onAddClient,
            onProspectsChanged: refreshProspects,
            agents: agents ?? [],
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
  onBack: () => void,
): React.ReactNode {
  const Crumb = ({ label }: { label: string }) => (
    <button
      type="button"
      className="hml-seg hml-seg-btn"
      onClick={onBack}
      title="Back"
    >
      {label}
    </button>
  );

  if (view.kind === "workspace") {
    if (view.tab === "sales") {
      return (
        <>
          <Crumb label="Agency" />
          <span className="hml-sep">/</span>
          <span className="hml-current">Sales pipeline</span>
        </>
      );
    }
    if (view.tab === "onboarding") {
      return (
        <>
          <Crumb label="Agency" />
          <span className="hml-sep">/</span>
          <span className="hml-current">Onboarding pipeline</span>
        </>
      );
    }
    const label = view.tab.charAt(0).toUpperCase() + view.tab.slice(1);
    return (
      <>
        <Crumb label="Workspace" />
        <span className="hml-sep">/</span>
        <span className="hml-current">{label}</span>
      </>
    );
  }
  if (view.kind === "outreach") {
    if (view.section === "overview") {
      return (
        <>
          <Crumb label="Outreach" />
          <span className="hml-sep">/</span>
          <span className="hml-current">Overview</span>
        </>
      );
    }
    if (view.section === "prospect") {
      const p = prospects.find((p) => p.slug === view.prospectSlug);
      return (
        <>
          <Crumb label="Outreach" />
          <span className="hml-sep">/</span>
          <span className="hml-current">{p?.name ?? view.prospectSlug ?? "Prospect"}</span>
        </>
      );
    }
    const label =
      view.section === "lead-scraper"
        ? "Lead Scraper"
        : view.section === "web-designer"
          ? "Web Designer"
          : view.section === "dms"
            ? "Personalized DMs"
            : "Cold Call Sequence";
    return (
      <>
        <Crumb label="Outreach" />
        <span className="hml-sep">/</span>
        <span className="hml-current">{label}</span>
      </>
    );
  }
  if (view.kind === "personal") {
    const label =
      view.section === "hygiene"
        ? "Hygiene"
        : view.section === "clothing"
          ? "Clothes & Jewelry"
          : "Overview";
    return (
      <>
        <Crumb label="Personal" />
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
      <Crumb label="Clients" />
      <span className="hml-sep">/</span>
      <span className="hml-seg">{c?.name ?? view.slug}</span>
      <span className="hml-sep">/</span>
      <span className="hml-current">{sectionLabel}</span>
    </>
  );
}

function sectionToLabel(s: ClientSection): string {
  switch (s) {
    case "dashboard":
      return "Dashboard";
    case "onboarding":
      return "Onboarding";
    case "ads":
      return "Ads";
    case "documents":
      return "Drive";
    case "recordings":
      return "Recordings";
    case "websites":
      return "Websites";
    case "reporting":
      return "Reporting";
    case "settings":
      return "Settings";
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
    section: "overview" | "lead-scraper" | "web-designer" | "sequence" | "dms",
  ) => void;
  onSelectProspect: (slug: string) => void;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onSelectPersonalSection: (section: PersonalSection) => void;
  onOpenForm?: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
  onAddClient?: () => void;
  onProspectsChanged: () => void;
  agents: AgentSummary[];
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
    onSelectPersonalSection,
  } = args;

  if (view.kind === "workspace") {
    if (view.tab === "dashboard")
      return (
        <DashboardSurface
          clientCount={realClients.length}
          root={root}
          clients={realClients}
          prospects={prospects}
        />
      );
    if (view.tab === "clients" || view.tab === "ads")
      return (
        <ClientsLanding
          clients={realClients}
          root={root}
          onSelectClientSection={onSelectClientSection}
          onAddClient={args.onAddClient}
        />
      );
    if (view.tab === "sales") return <SalesHubPage root={root} />;
    if (view.tab === "onboarding") return <OnboardingHubPage />;
    if (view.tab === "tasks")
      return <TasksTrackerPage root={root} clients={realClients} />;
    if (view.tab === "revenue")
      return <RevenueTrackerPage root={root} clients={realClients} />;
    if (view.tab === "recordings") return <RecordingsPage root={root} clients={realClients} />;
    if (view.tab === "sops") return <SOPsPage root={root} />;
    if (view.tab === "resources") return <ResourcesPage root={root} />;
    if (view.tab === "creative-studio")
      return root ? (
        <CreativeStudio
          root={root}
          clients={realClients}
          activeClientSlug={activeClientSlug ?? null}
        />
      ) : null;
    if (view.tab === "automations") return <AutomationsPage />;
    if (view.tab === "calendar")
      return <CalendarPage root={root} onBack={args.onBack} clients={realClients} />;
    return null;
  }

  if (view.kind === "outreach") {
    if (view.section === "overview") {
      return (
        <OutreachHub
          root={root}
          prospects={prospects}
          onSelectSection={onSelectOutreachSection}
          onSelectProspect={onSelectProspect}
          onProspectsChanged={args.onProspectsChanged}
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
    if (view.section === "sequence") {
      return (
        <OutreachSequencePage
          root={root}
          onExit={() => onSelectOutreachSection("overview")}
        />
      );
    }
    if (view.section === "dms") {
      return (
        <OutreachDmsPage
          root={root}
          onExit={() => onSelectOutreachSection("overview")}
        />
      );
    }
    if (view.section === "prospect" && activeProspect) {
      return <OutreachProspectPage prospect={activeProspect} />;
    }
    return null;
  }

  if (view.kind === "personal") {
    return (
      <PersonalHubPage
        section={view.section}
        root={root}
        onSelectSection={onSelectPersonalSection}
      />
    );
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
      agents={args.agents}
      onSelectSection={(section) => onSelectClientSection(c.slug, section)}
      onOpenForm={
        args.onOpenForm ?? (() => undefined)
      }
      onOpenDrive={
        c.drive_folder_url
          ? () => {
              openInAppWindow(c.drive_folder_url!, `${c.name}: Drive`);
            }
          : undefined
      }
    />
  );
}

function DashboardSurface({
  clientCount,
  root,
  clients,
  prospects,
}: {
  clientCount: number;
  root: string | null;
  clients: ClientEntry[];
  prospects: ProspectEntry[];
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
  const [tasksFile, setTasksFile] = useState<OpsTasksFile>({ tasks: [] });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadEventsFor = useCallback(
    async (conn: CalendarConnection | null) => {
      // HML appointments are always shown — they exist independently of
      // whether the user has connected a public-calendar read source.
      const apptEvents = await loadAppointmentEvents(root);
      if (!conn) {
        if (!mountedRef.current) return;
        setEvents(apptEvents);
        setFetchError(null);
        return;
      }
      try {
        const parsed = await fetchCalendarEvents(conn);
        if (!mountedRef.current) return;
        setEvents(mergeEvents(parsed, apptEvents));
        setFetchError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        // GCal fetch failed — appointments still load.
        setEvents(apptEvents);
        setFetchError(err instanceof Error ? err.message : String(err));
      }
    },
    [root],
  );

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

  const refreshTasks = useCallback(async () => {
    if (!root) {
      setTasksFile({ tasks: [] });
      return;
    }
    try {
      const next = await api.readOpsTasks(root);
      if (!mountedRef.current) return;
      setTasksFile(next);
    } catch {
      if (!mountedRef.current) return;
      setTasksFile({ tasks: [] });
    }
  }, [root]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const today = todayYMD();
  const monday = mondayYMD();
  const dow = todayDow();
  const scheduledDailyTasks = tasksFile.tasks.filter(
    (t) =>
      t.lane === "daily" ||
      (t.lane === "weekly" && (t.weeklyDay ?? 1) === dow),
  );
  // Fallback: when nothing is scheduled for today, surface Active-lane tasks
  // so the dashboard widget still has something to chew on. Keep done rows in
  // the list so checking one crosses it out instead of making it vanish.
  const activeFallbackTasks = tasksFile.tasks.filter(
    (t) => t.lane === "active" || t.lane === undefined,
  );
  const usingActiveFallback =
    scheduledDailyTasks.length === 0 && activeFallbackTasks.length > 0;
  const dailyTasks = usingActiveFallback ? activeFallbackTasks : scheduledDailyTasks;

  const knownClientSlugs = useMemo(
    () => new Set(clients.map((c) => c.slug)),
    [clients],
  );
  const fallbackCategories = useMemo(() => {
    if (!usingActiveFallback) return [];
    const categoryOf = (t: OpsTask): string | null =>
      t.clientSlug && knownClientSlugs.has(t.clientSlug) ? t.clientSlug : null;
    const order: { slug: string | null; name: string }[] = [
      { slug: null, name: "Internal" },
      ...clients.map((c) => ({ slug: c.slug as string | null, name: c.name })),
    ];
    return order
      .map((cat) => ({
        ...cat,
        tasks: dailyTasks.filter((t) => categoryOf(t) === cat.slug),
      }))
      .filter((cat) => cat.tasks.length > 0);
  }, [usingActiveFallback, clients, dailyTasks, knownClientSlugs]);
  const isTaskDoneToday = useCallback(
    (t: OpsTask) =>
      t.lane === "weekly"
        ? t.lastCompletedWeek === monday
        : t.lane === "daily"
          ? t.lastCompletedDate === today
          : t.status === "done",
    [monday, today],
  );
  const dailyDoneCount = dailyTasks.filter(isTaskDoneToday).length;

  const toggleDailyDone = useCallback(
    async (task: OpsTask, done: boolean) => {
      if (!root) return;
      const next: OpsTasksFile = {
        tasks: tasksFile.tasks.map((t) =>
          t.id === task.id
            ? task.lane === "weekly"
              ? { ...t, lastCompletedWeek: done ? monday : null }
              : task.lane === "daily"
                ? { ...t, lastCompletedDate: done ? today : null }
                : { ...t, status: done ? "done" : "todo" }
            : t,
        ),
      };
      setTasksFile(next);
      try {
        await api.writeOpsTasks(root, next);
      } catch {
        // If the write fails, pull the truth back from disk.
        void refreshTasks();
      }
    },
    [root, tasksFile, today, monday, refreshTasks],
  );

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
    // When the background GHL sync writes a new/changed/cancelled booking,
    // pull the Today panel back in step without waiting for the 10-min tick.
    const onSync = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(GHL_SYNC_EVENT, onSync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(GHL_SYNC_EVENT, onSync);
    };
  }, [root, refresh]);

  const handleSaveConnection = useCallback(
    async (apiKey: string, calendarId: string, label: string) => {
      if (!root) {
        throw new Error("No media-buying folder selected. Pick a folder first.");
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

  // "Calls booked today" — count of prospects newly moved into the
  // `scheduled` state whose lastTouchedAt falls on today. Best signal we have
  // until a proper bookings log exists.
  const todayStamp = new Date().toISOString().slice(0, 10);
  const callsBookedToday = prospects.filter((p) => {
    if (p.status !== "scheduled") return false;
    if (!p.lastTouchedAt) return false;
    return p.lastTouchedAt.slice(0, 10) === todayStamp;
  }).length;

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
            <span className="hml-stat-delta hml-flat">stable</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconTarget className="hml-icon" />
            Calls Booked Today
          </div>
          <div className="hml-stat-value">
            {callsBookedToday}
            {callsBookedToday > 0 ? (
              <span className="hml-stat-delta hml-pos">today</span>
            ) : (
              <span className="hml-stat-delta hml-flat">none yet</span>
            )}
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
              <span className="hml-stat-delta hml-flat">clear</span>
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
          Calendar fetch failed. Try Reconnect.
        </div>
      ) : null}

      {/* Two-col: activity feed + today calendar ───────────── */}
      <section className="hml-col-2">
        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Daily routine
            </div>
            <span className="hml-panel-action">
              {dailyTasks.length === 0
                ? "Add in Tasks"
                : usingActiveFallback
                  ? `From Active · ${dailyDoneCount} / ${dailyTasks.length} done`
                  : `${dailyDoneCount} / ${dailyTasks.length} done`}
            </span>
          </div>
          <div className="hml-panel-body">
            {dailyTasks.length === 0 ? (
              <div className="hml-empty">
                <div className="hml-empty-title">No daily tasks yet</div>
                <div className="hml-empty-sub">
                  Add recurring daily work in Workspace → Tasks → Daily routine.
                  They'll show up here every day.
                </div>
              </div>
            ) : usingActiveFallback ? (
              <ul className="hml-daily-list">
                {fallbackCategories.map((cat) => (
                  <Fragment key={cat.slug ?? "__internal__"}>
                    <li className="hml-daily-cat-header">
                      <span className="hml-daily-cat-name">{cat.name}</span>
                      <span className="hml-daily-cat-count">
                        {cat.tasks.length}
                      </span>
                    </li>
                    {cat.tasks.map((t) => {
                      const done = isTaskDoneToday(t);
                      return (
                        <li
                          key={t.id}
                          className={`hml-daily-row${done ? " hml-daily-done" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="hml-daily-check"
                            checked={done}
                            onChange={(e) => {
                              void toggleDailyDone(t, e.target.checked);
                            }}
                            aria-label={`Mark "${t.title || "untitled"}" done`}
                          />
                          <span className="hml-daily-title">
                            {t.title.trim() || <em>(untitled)</em>}
                          </span>
                        </li>
                      );
                    })}
                  </Fragment>
                ))}
              </ul>
            ) : (
              <ul className="hml-daily-list">
                {dailyTasks.map((t) => {
                  const done = isTaskDoneToday(t);
                  return (
                    <li
                      key={t.id}
                      className={`hml-daily-row${done ? " hml-daily-done" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="hml-daily-check"
                        checked={done}
                        onChange={(e) => {
                          void toggleDailyDone(t, e.target.checked);
                        }}
                        aria-label={`Mark "${t.title || "untitled"}" done`}
                      />
                      <span className="hml-daily-title">
                        {t.title.trim() || <em>(untitled)</em>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
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
            {todayEvents.length === 0 && !connection ? (
              <div className="hml-empty">
                <div className="hml-empty-title">No calendar connected</div>
                <div className="hml-empty-sub">
                  Hook up a Google Calendar to see today at a glance. GHL
                  bookings will also surface here once you pick a booking
                  calendar in the Sales Hub.
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

function greetingForHour(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}
