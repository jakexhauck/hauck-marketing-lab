import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { AGENTS, agentPath, type AgentId } from "../../../lib/agents";
import type { AgentItem } from "../../../lib/agentWire";
import { STATUS_PILL, WORKING_AGENTS, clientRowView } from "../../../lib/agentView";
import { shortAgentName } from "../../../lib/brainGraph";
import type { AdminClient } from "../../../lib/api";
import { SOP_LISTS, sopKeys } from "../../../lib/sopChecklists";
import { useAdminOnboardingChecklistQuery } from "../../../hooks/useApi";
import ClientMark from "../../ClientMark";
import { AGENT_ICONS } from "../clientRowIcons";
import ItemCard from "./ItemCard";
import { useClientsItems, type ItemAction } from "./agentApi";

const byNewest = (a: AgentItem, b: AgentItem) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
const short = (id: AgentId) => shortAgentName(AGENTS.find((a) => a.id === id)?.name ?? id);
const iconFor = (id: AgentId) => AGENT_ICONS[id] ?? Gauge;

// Building tab for a working agent: open work first (the newest one ringed),
// then what is live, then what is done. Declined work drops off.
export function AgentBuilding({
  agent,
  items,
  onAction,
  busy,
}: {
  agent: AgentId;
  items: AgentItem[];
  onAction: (itemId: string, action: ItemAction, note?: string) => void;
  busy: boolean;
}) {
  const mine = items.filter((i) => i.agent === agent).sort(byNewest);
  const open = mine.filter((i) => i.status === "building" || i.status === "needs_ok");
  const live = mine.filter((i) => i.status === "live");
  const done = mine.filter((i) => i.status === "done");
  if (open.length + live.length + done.length === 0) return <div className="ag-empty">Nothing building</div>;
  const card = (i: AgentItem, active = false) => (
    <ItemCard key={i.id} item={i} active={active} busy={busy} onAction={(a, n) => onAction(i.id, a, n)} />
  );
  return (
    <>
      {open.map((i, n) => card(i, n === 0))}
      {live.length > 0 && <div className="ag-sec">Live</div>}
      {live.map((i) => card(i))}
      {done.length > 0 && <div className="ag-sec">Done</div>}
      {done.map((i) => card(i))}
    </>
  );
}

// The Manager inside one client: setup progress, what waits on Jake, and
// where each agent is.
export function ManagerBuilding({ client, items }: { client: AdminClient; items: AgentItem[] }) {
  const checklist = useAdminOnboardingChecklistQuery(client.id);
  const setup = useMemo(() => {
    const keys = sopKeys(SOP_LISTS["full-setup"]);
    const done = new Set((checklist.data?.items ?? []).filter((i) => i.done).map((i) => i.task_key));
    return { done: keys.filter((k) => done.has(k)).length, total: keys.length };
  }, [checklist.data]);
  const waiting = items.filter((i) => i.status === "needs_ok").sort(byNewest);
  const live = client.onboardingStatus === "live";

  return (
    <>
      <div className="ag-sec">{client.name}</div>
      <div className="ag-card">
        <div className="ag-card-top">
          <div className="ag-card-t">Setup</div>
          <span className={`ag-pill ${live ? "ag-p-live" : "ag-p-wip"}`}>{live ? "Live" : "Setup"}</span>
        </div>
        <div className="ag-progress">
          <i style={{ width: `${setup.total ? Math.round((setup.done / setup.total) * 100) : 0}%` }} />
        </div>
        <div className="ag-meta-row">
          <span>{SOP_LISTS["full-setup"].title}</span>
          <span>{checklist.data ? `${setup.done} / ${setup.total}` : ""}</span>
        </div>
      </div>
      <div className="ag-card">
        <div className="ag-card-top">
          <div className="ag-card-t">Waiting on you</div>
          <span className="ag-pill ag-p-ok">{waiting.length}</span>
        </div>
        {waiting.length > 0 && (
          <div className="ag-list">
            {waiting.map((i) => {
              const Icon = iconFor(i.agent);
              return (
                <div key={i.id}>
                  <Icon />
                  {short(i.agent)}: {i.title}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="ag-card">
        <div className="ag-card-top">
          <div className="ag-card-t">Agents</div>
        </div>
        <div className="ag-list">
          {WORKING_AGENTS.map((a) => {
            const Icon = iconFor(a);
            const latest = items.filter((i) => i.agent === a && i.status !== "declined").sort(byNewest)[0];
            return (
              <div key={a}>
                <Icon />
                {short(a)}: {latest ? `${latest.title}, ${STATUS_PILL[latest.status].label.toLowerCase()}` : "idle"}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// The agency Manager's Clients tab: each client's status, next step and one
// dot per working agent.
export function ClientsBoard({ clients }: { clients: AdminClient[] }) {
  const results = useClientsItems(clients.map((c) => c.id));
  if (clients.length === 0) return <div className="ag-empty">No clients</div>;
  return (
    <>
      {clients.map((c, i) => {
        const view = clientRowView(results[i]?.data?.items ?? []);
        const live = c.onboardingStatus === "live";
        return (
          <Link key={c.id} to={agentPath(c.id, "manager")} className="ag-clientrow">
            <div
              className="ag-cmark"
              style={{ background: `linear-gradient(135deg, ${c.brandColor}, color-mix(in srgb, ${c.brandColor} 72%, white))` }}
            >
              <ClientMark picture={c.brandLogoUrl} initials={c.brandInitials || c.name.slice(0, 2).toUpperCase()} />
            </div>
            <div className="ag-cbody">
              <div className="ag-cname">
                <span className="t">{c.name}</span>
                <span className={`ag-pill ${live ? "ag-p-live" : "ag-p-wip"}`}>{live ? "Live" : "Setup"}</span>
              </div>
              <div className="ag-cnext">{results[i]?.data ? view.next : ""}</div>
              <div className="ag-agentdots">
                {view.dots.map((d, n) => (
                  <i key={n} className={d} title={short(WORKING_AGENTS[n])} />
                ))}
              </div>
            </div>
          </Link>
        );
      })}
    </>
  );
}
