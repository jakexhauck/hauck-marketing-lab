import { cn } from "../lib/cn";
import type { ChatSummary, FolderSummary } from "../lib/types";
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
  drawerOpen: boolean;
  onOpenChat: (chat: ChatSummary) => void;
};

export function Dashboard({ summary, clientName, drawerOpen, onOpenChat }: Props) {
  return (
    <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
      <Hero clientName={clientName} />
      <Kpis />
      <section className="row-split reveal reveal-3">
        <DiagnosisPanel />
        <TrackingPulse />
      </section>
      <section className="row-3 reveal reveal-4">
        <CreativeRing />
        <ActivityFeed chats={summary.chats} knowledgeCount={summary.knowledge_count} />
        <RecentThreads chats={summary.chats} onOpen={onOpenChat} />
      </section>
    </main>
  );
}
