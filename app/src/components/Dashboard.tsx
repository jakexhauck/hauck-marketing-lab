import { cn } from "../lib/cn";
import type { ChatSummary, ClientStatus, FolderSummary } from "../lib/types";
import { ActivityFeed } from "./ActivityFeed";
import { CreativeRing } from "./CreativeRing";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { Hero } from "./Hero";
import { Kpis } from "./Kpis";
import { PreLaunchDashboard } from "./PreLaunchDashboard";
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
  onAskAurelius: (bundledPrompt: string) => void;
  onOpenDiagnosis: () => void;
};

export function Dashboard({
  summary,
  clientName,
  clientSlug,
  clientStatus,
  root,
  drawerOpen,
  onOpenChat,
  onAskAurelius,
  onOpenDiagnosis,
}: Props) {
  if (clientStatus === "pre-launch") {
    return (
      <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
        <PreLaunchDashboard
          root={root}
          clientName={clientName}
          clientSlug={clientSlug}
          drawerOpen={drawerOpen}
          onAskAurelius={onAskAurelius}
        />
      </main>
    );
  }

  return (
    <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
      <Hero
        clientName={clientName}
        root={root}
        clientSlug={clientSlug}
        onOpenDiagnosis={onOpenDiagnosis}
      />
      <Kpis root={root} clientSlug={clientSlug} />
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
