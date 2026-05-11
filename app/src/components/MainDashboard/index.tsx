import { useState } from "react";
import "./main-dashboard.css";
import { TopBar } from "./TopBar";
import { Sidebar, type WorkflowView, type WorkspaceView } from "./Sidebar";
import type { ClientSection } from "./ClientTree";
import { GreetingCard } from "./GreetingCard";
import { MiniStats } from "./MiniStats";
import { BookedToday } from "./BookedToday";
import { CalendarWidget } from "./CalendarWidget";
import { ClientOverview } from "./pages/ClientOverview";
import { ClientContract } from "./pages/ClientContract";
import { ClientResources } from "./pages/ClientResources";
import { ClientCampaigns } from "./pages/ClientCampaigns";
import { ClientInvoices } from "./pages/ClientInvoices";
import type { ClientEntry } from "../../lib/types";

interface MainDashboardProps {
  onOpenMediaBuying: () => void;
  /** Real clients loaded from disk. Empty array means no clients on file. */
  clients?: ClientEntry[] | null;
  /** Selected media-buying folder root; required for backend calls from sub-pages. */
  root?: string | null;
}

type View =
  | { kind: "dashboard" }
  | { kind: "workspace"; tab: WorkspaceView }
  | { kind: "client"; slug: string; section: ClientSection };

export function MainDashboard({ onOpenMediaBuying, clients, root }: MainDashboardProps) {
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
      <TopBar onBrandClick={goDashboard} />
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
    return <DashboardSurface clientCount={realClients.length} />;
  }
  if (view.kind === "workspace") {
    const label = view.tab === "calendar" ? "Calendar" : "Tasks";
    return (
      <div className="md-placeholder">
        <button type="button" className="md-back" onClick={onBack}>
          ◂ Back to dashboard
        </button>
        <div>
          <span className="md-tag">▸ NOT WIRED</span>
          Workspace · {label}
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

function DashboardSurface({ clientCount }: { clientCount: number }) {
  const now = new Date();
  const weekday = now
    .toLocaleDateString(undefined, { weekday: "long" })
    .toUpperCase();
  const date = now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

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
      <MiniStats clientCount={clientCount} />

      <section className="md-split md-reveal md-reveal-4">
        <BookedToday />
        <CalendarWidget />
      </section>
    </>
  );
}
