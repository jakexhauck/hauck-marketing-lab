import { cn } from "../lib/cn";
import type { AgentSummary } from "../lib/types";

type Props = {
  agents: AgentSummary[];
  activeSlug: string | null;
  drawerOpen: boolean;
  onSelect: (agent: AgentSummary) => void;
};

export function AgentRail({ agents, activeSlug, drawerOpen, onSelect }: Props) {
  return (
    <aside className={cn("agent-rail", drawerOpen && "with-drawer")}>
      <div className="agent-rail-label">
        AGENTS · {agents.length}
        {drawerOpen && activeSlug && <span className="on-call">ON CALL</span>}
      </div>

      {agents.map((agent) => {
        const active = activeSlug === agent.slug;
        const dim = drawerOpen && !active;
        return (
          <div
            key={agent.slug}
            className={cn("agent-cell", active && "active", dim && "dim")}
          >
            <button
              className="agent-btn"
              title={agent.name}
              onClick={() => onSelect(agent)}
            >
              {agent.initial}
            </button>
            <div className="agent-name">{agent.short}</div>
            {drawerOpen && active && (
              <div className="agent-status">
                ON CALL
                <span className="typing-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
          </div>
        );
      })}

      {drawerOpen && <div className="rail-glow" />}
    </aside>
  );
}
