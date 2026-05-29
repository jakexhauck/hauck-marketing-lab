import { cn } from "../lib/cn";
import type { ChatSummary, ClientStatus, FolderSummary } from "../lib/types";
import { ActivityFeed } from "./ActivityFeed";
import { CreativeRing } from "./CreativeRing";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { Hero } from "./Hero";
import { Kpis } from "./Kpis";
import { RecentThreads } from "./RecentThreads";
import { TrackingPulse } from "./TrackingPulse";

type Props = {
  summary: FolderSummary;
  clientName: string;
  clientSlug: string;
  clientStatus: ClientStatus;
  root: string;
  drawerOpen: boolean;
  onOpenChat: (chat: ChatSummary) => void;
  onOpenDiagnosis: () => void;
  onBackToOnboarding?: () => void;
  onOpenCreativeBrief?: () => void;
  onOpenTrackingAudit?: () => void;
  onOpenWorkflowLaunch?: () => void;
  onOpenWorkflowOptimize?: () => void;
  onOpenWorkflowScale?: () => void;
};

export function Dashboard({
  summary,
  clientName,
  clientSlug,
  clientStatus,
  root,
  drawerOpen,
  onOpenChat,
  onOpenDiagnosis,
  onBackToOnboarding,
  onOpenCreativeBrief,
  onOpenTrackingAudit,
  onOpenWorkflowLaunch,
  onOpenWorkflowOptimize,
  onOpenWorkflowScale,
}: Props) {
  if (clientStatus === "pre-launch") {
    return (
      <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
        <PageHead
          clientName={clientName}
          subtitle="Pre-launch"
          onBackToOnboarding={onBackToOnboarding}
        />
        <NotLaunchedYet
          clientName={clientName}
          onBackToOnboarding={onBackToOnboarding}
        />
        <GeneratorRail
          onOpenCreativeBrief={onOpenCreativeBrief}
          onOpenTrackingAudit={onOpenTrackingAudit}
          onOpenWorkflowLaunch={onOpenWorkflowLaunch}
          onOpenWorkflowOptimize={onOpenWorkflowOptimize}
          onOpenWorkflowScale={onOpenWorkflowScale}
        />
      </main>
    );
  }

  return (
    <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
      <PageHead
        clientName={clientName}
        subtitle="Live"
        onBackToOnboarding={onBackToOnboarding}
      />
      <Hero
        clientName={clientName}
        root={root}
        clientSlug={clientSlug}
        onOpenDiagnosis={onOpenDiagnosis}
      />
      <Kpis root={root} clientSlug={clientSlug} />
      <GeneratorRail
        onOpenCreativeBrief={onOpenCreativeBrief}
        onOpenTrackingAudit={onOpenTrackingAudit}
        onOpenWorkflowLaunch={onOpenWorkflowLaunch}
        onOpenWorkflowOptimize={onOpenWorkflowOptimize}
        onOpenWorkflowScale={onOpenWorkflowScale}
      />
      <section className="row-split reveal reveal-3">
        <DiagnosisPanel root={root} clientSlug={clientSlug} />
        <TrackingPulse root={root} clientSlug={clientSlug} />
      </section>
      <section className="row-3 reveal reveal-4">
        <CreativeRing root={root} clientSlug={clientSlug} />
        <ActivityFeed chats={summary.chats} knowledgeCount={summary.knowledge_count} />
        <RecentThreads chats={summary.chats} onOpen={onOpenChat} />
      </section>
    </main>
  );
}

function PageHead({
  clientName,
  subtitle,
  onBackToOnboarding,
}: {
  clientName: string;
  subtitle: string;
  onBackToOnboarding?: () => void;
}) {
  const now = new Date();
  const weekday = now
    .toLocaleDateString(undefined, { weekday: "long" })
    .toUpperCase();
  const date = now
    .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="md-page-head md-reveal md-reveal-1" style={{ marginBottom: 28 }}>
      <div className="md-page-head-left">
        <span className="md-page-head-eyebrow">▸ Media Buying · {subtitle}</span>
        <h1>
          <span className="md-copper-text">{clientName}</span>
        </h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {onBackToOnboarding && (
          <button
            type="button"
            className="md-back"
            onClick={onBackToOnboarding}
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              background: "none",
              border: "1px solid var(--border-strong)",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            ◂ Onboarding
          </button>
        )}
        <div className="md-date">
          {weekday}
          <br />
          {date} · {time}
        </div>
      </div>
    </section>
  );
}

function NotLaunchedYet({
  clientName,
  onBackToOnboarding,
}: {
  clientName: string;
  onBackToOnboarding?: () => void;
}) {
  return (
    <section
      className="reveal reveal-2"
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        padding: "56px 48px",
        marginBottom: 32,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: "var(--copper)",
          marginBottom: 18,
          fontWeight: 600,
        }}
      >
        ▸ Campaign not launched
      </div>
      <h2
        style={{
          fontFamily: "var(--sans)",
          fontWeight: 500,
          fontSize: 26,
          color: "var(--text)",
          lineHeight: 1.3,
          marginBottom: 14,
          letterSpacing: "-0.012em",
        }}
      >
        No data yet for {clientName}.
      </h2>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: 15,
          maxWidth: 540,
          margin: "0 auto 26px",
          lineHeight: 1.55,
        }}
      >
        Once the first campaign goes live, performance data will appear here:
        KPIs, diagnosis, tracking pulse, and creative signals.
      </p>
      {onBackToOnboarding && (
        <button
          type="button"
          onClick={onBackToOnboarding}
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--copper)",
            background: "none",
            border: "1px solid var(--copper)",
            padding: "10px 22px",
            cursor: "pointer",
          }}
        >
          ◂ Back to onboarding checklist
        </button>
      )}
    </section>
  );
}

function GeneratorRail({
  onOpenCreativeBrief,
  onOpenTrackingAudit,
  onOpenWorkflowLaunch,
  onOpenWorkflowOptimize,
  onOpenWorkflowScale,
}: {
  onOpenCreativeBrief?: () => void;
  onOpenTrackingAudit?: () => void;
  onOpenWorkflowLaunch?: () => void;
  onOpenWorkflowOptimize?: () => void;
  onOpenWorkflowScale?: () => void;
}) {
  const tiles: Array<{
    label: string;
    agent: string;
    blurb: string;
    onClick?: () => void;
    accent?: string;
  }> = [
    {
      label: "Creative brief",
      agent: "VORTEX",
      blurb: "Designer-ready brief from inputs",
      onClick: onOpenCreativeBrief,
    },
    {
      label: "Tracking audit",
      agent: "NEXUS",
      blurb: "Pixel · CAPI · dedup · EMQ walk-through",
      onClick: onOpenTrackingAudit,
    },
    {
      label: "Workflow · launch",
      agent: "MULTI",
      blurb: "Aurelius → Stratos → Vortex → Nexus → Aurelius",
      onClick: onOpenWorkflowLaunch,
      accent: "copper",
    },
    {
      label: "Workflow · optimize",
      agent: "MULTI",
      blurb: "Zenith → Stratos → Vortex → Aurelius",
      onClick: onOpenWorkflowOptimize,
      accent: "copper",
    },
    {
      label: "Workflow · scale",
      agent: "MULTI",
      blurb: "Stratos → Vortex → Nexus → Aurelius",
      onClick: onOpenWorkflowScale,
      accent: "copper",
    },
  ].filter((t) => !!t.onClick);

  if (tiles.length === 0) return null;

  return (
    <section className="reveal reveal-2" style={{ marginBottom: 32 }}>
      <div
        className="panel-head"
        style={{ marginBottom: 12, paddingLeft: 4, border: "none" }}
      >
        <span className="panel-title">▸ GENERATORS</span>
        <span className="panel-meta">produce artifacts · outputs/</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            className="panel"
            onClick={t.onClick}
            style={{
              textAlign: "left",
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              transition: "border-color 0.15s, transform 0.15s",
              padding: 16,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor =
                t.accent === "copper" ? "var(--copper-glow)" : "var(--border-strong)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                letterSpacing: "0.12em",
                color: t.accent === "copper" ? "var(--copper)" : "var(--text-faint)",
                marginBottom: 8,
              }}
            >
              ▸ {t.agent}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 6,
              }}
            >
              {t.label}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {t.blurb}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
