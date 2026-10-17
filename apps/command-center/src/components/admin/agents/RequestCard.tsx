import { ArrowRight, Link as LinkIcon, Sparkles } from "lucide-react";
import { AGENTS, type AgentId } from "../../../lib/agents";
import type { AgentItem, AgentMessage } from "../../../lib/agentWire";
import { ago, itemPayload } from "../../../lib/agentView";
import { AGENT_COLORS } from "../../../lib/brainGraph";
import { AGENT_ICONS } from "../clientRowIcons";
import { ItemActions, StatusPill } from "./ItemCard";
import type { ItemAction } from "./agentApi";

const agentName = (id: AgentId | null) => AGENTS.find((a) => a.id === id)?.name ?? "Agent";

// A request from another agent: who sent it, the ask, any link. Then, when the
// item behind it carries a plan, the receiving agent's exact planned changes
// with Approve / Change it / Decline. Nothing happens without that click.
export default function RequestCard({
  msg,
  item,
  now,
  onAction,
  busy,
}: {
  msg: AgentMessage;
  item: AgentItem | null;
  now: Date;
  onAction: (action: ItemAction, note?: string) => void;
  busy: boolean;
}) {
  const from = msg.fromAgent ?? item?.fromAgent ?? null;
  const Icon = AGENT_ICONS[from ?? ""] ?? Sparkles;
  const p = item ? itemPayload(item.payload) : null;
  return (
    <>
      <div className="ag-handoff">
        <div className="ag-ho-top">
          <span className="ag-ho-ic" style={{ background: from ? AGENT_COLORS[from] : "var(--brand)" }}>
            <Icon />
          </span>
          <b>{agentName(from)}</b>
          <span className="ag-ho-tag">Request</span>
          <span className="ag-ho-time">{ago(msg.createdAt, now)}</span>
        </div>
        <div className="ag-ho-tx">{msg.body}</div>
        {p?.previewUrl && (
          <a className="ag-ho-link" href={p.previewUrl} target="_blank" rel="noreferrer">
            <LinkIcon />
            {p.previewUrl.replace(/^https:\/\//, "")}
          </a>
        )}
      </div>
      {item && p && p.plan.length > 0 && (
        <div className="ag-m ai">
          <div className="ag-av">
            <Sparkles />
          </div>
          <div className="ag-card" style={{ flex: 1 }}>
            <div className="ag-card-top">
              <div className="ag-card-t">{item.title}</div>
              <StatusPill status={item.status} />
            </div>
            <div className="ag-list">
              {p.plan.map((t, i) => (
                <div key={i}>
                  <ArrowRight />
                  {t}
                </div>
              ))}
            </div>
            {item.status === "needs_ok" && <ItemActions onAction={onAction} busy={busy} />}
          </div>
        </div>
      )}
    </>
  );
}
