import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { Gauge } from "lucide-react";
import { AGENTS, type AgentId } from "../../../lib/agents";
import type { GraphClient, BrainScope } from "../../../lib/brainGraph";
import { useAdminClientsQuery } from "../../../hooks/useApi";
import { AGENT_ICONS } from "../clientRowIcons";
import ChatList from "./ChatList";
import ChatThread from "./ChatThread";
import BrainTab from "./BrainTab";
import { AgentBuilding, ClientsBoard, ManagerBuilding } from "./BuildPanel";
import { BriefTab } from "./BriefPanel";
import {
  tenantKey,
  useAgentChats,
  useAgentItems,
  useAgentLessons,
  useItemAction,
  useNewChat,
  useSendMessage,
  type ItemAction,
} from "./agentApi";

// One agent's page: chat list, chat, and the Building / Brain panel.
// tenantId null is the agency Manager (Clients / Mega Brain). Built to
// .superpowers/brainstorm/559-1792256193/content/agents-v3.html (Task 7).
//
// Inside a client it is layout B of agents-brief.html (Phase 6): the chat list
// shrinks to icons and the right half is Brief | Building | Brain, the Client
// Brief first. The agency Manager has no client and so no brief; it keeps the
// three-column frame.
export default function AgentPage({ tenantId, agent }: { tenantId: string | null; agent: AgentId }) {
  // Keyed so the tab, scope and open chat reset when the agent or client does.
  return <AgentView key={`${tenantKey(tenantId)}/${agent}`} tenantId={tenantId} agent={agent} />;
}

// Inside a client the page wears that client's colour, as the rail does. Only
// --brand is set here; the derived tokens are rebuilt from it in AgentStyle.
const brandVars = (color: string | undefined): CSSProperties | undefined =>
  color ? ({ "--brand": color } as CSSProperties) : undefined;

function AgentView({ tenantId, agent }: { tenantId: string | null; agent: AgentId }) {
  const tk = tenantKey(tenantId);
  const def = AGENTS.find((a) => a.id === agent) ?? AGENTS[0];
  const Icon = AGENT_ICONS[agent] ?? Gauge;
  const isManager = agent === "manager";

  const clientsQuery = useAdminClientsQuery(true);
  const clients = useMemo(() => clientsQuery.data?.clients ?? [], [clientsQuery.data]);
  const client = tenantId ? (clients.find((c) => c.id === tenantId) ?? null) : null;
  const graphClients = useMemo<GraphClient[]>(
    () => clients.map((c) => ({ id: c.id, name: c.name, color: c.brandColor })),
    [clients],
  );

  const chats = useAgentChats(tk, agent);
  const newChat = useNewChat(tk, agent);
  const send = useSendMessage(tk, agent);
  const items = useAgentItems(tk);
  const act = useItemAction(tk);
  const allItems = useMemo(() => items.data?.items ?? [], [items.data]);

  // The open chat lives in ?chat= so a reload or a shared link reopens it.
  const [params, setParams] = useSearchParams();
  const chatList = useMemo(() => chats.data ?? [], [chats.data]);
  const asked = params.get("chat");
  const newest = useMemo(
    () => [...chatList].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null,
    [chatList],
  );
  const selected = chatList.find((c) => c.id === asked) ?? newest;
  const select = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("chat", id);
        return next;
      },
      { replace: true },
    );

  // Pin the default (newest) chat into the address, so a new Auto chat landing
  // on the 15s refetch does not swap the open chat out from under a draft.
  useEffect(() => {
    if (!asked && newest) select(newest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, newest?.id]);

  const startChat = async () => {
    const chat = await newChat.mutateAsync();
    select(chat.id);
    return chat.id;
  };

  const split = tenantId !== null;
  const [tab, setTab] = useState<"brief" | "building" | "brain">(split ? "brief" : "building");
  // The Manager reads and writes the Mega Brain only.
  const [scope, setScope] = useState<BrainScope>(isManager ? "mega" : "client");
  const lessons = useAgentLessons(tk, agent, scope);
  const lessonList = useMemo(() => lessons.data?.lessons ?? [], [lessons.data]);

  const onAction = (itemId: string, action: ItemAction, note?: string) => act.mutate({ id: itemId, action, note });

  const building =
    tenantId === null ? (
      <ClientsBoard clients={clients} />
    ) : items.isLoading || (isManager && !client) ? (
      <div className="ag-empty">Loading...</div>
    ) : items.isLoadingError ? (
      <div className="ag-empty">Work did not load.</div>
    ) : isManager && client ? (
      <ManagerBuilding client={client} items={allItems} />
    ) : (
      <AgentBuilding agent={agent} items={allItems} onAction={onAction} busy={act.isPending} />
    );

  return (
    <div className="ag" style={brandVars(client?.brandColor)}>
      <AgentStyle />
      <ChatList
        name={def.name}
        icon={Icon}
        chats={chatList}
        loading={chats.isLoading}
        failed={chats.isLoadingError}
        selectedId={selected?.id ?? null}
        onSelect={select}
        onNew={() => void startChat().catch(() => undefined)}
        newBusy={newChat.isPending}
        mini={split}
      />
      <ChatThread
        key={selected?.id ?? "none"}
        chatId={selected?.id ?? null}
        title={selected?.title ?? "New chat"}
        agentName={def.name}
        items={allItems}
        onAction={onAction}
        actionBusy={act.isPending}
        onEnsureChat={startChat}
        onSend={(chatId, body) => send.mutateAsync({ chatId, body })}
        sending={send.isPending || newChat.isPending}
      />
      <section className={split ? "ag-split" : `ag-build${tab === "brain" ? " wide" : ""}`}>
        <div className="ag-tabs" role="tablist">
          {split && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "brief"}
              className={`ag-tab${tab === "brief" ? " on" : ""}`}
              onClick={() => setTab("brief")}
            >
              Brief
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "building"}
            className={`ag-tab${tab === "building" ? " on" : ""}`}
            onClick={() => setTab("building")}
          >
            {tenantId === null ? "Clients" : "Building"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "brain"}
            className={`ag-tab${tab === "brain" ? " on" : ""}`}
            onClick={() => setTab("brain")}
          >
            {isManager ? "Mega Brain" : "Brain"}
            {lessons.data && <span className="ct">{lessonList.length}</span>}
          </button>
        </div>
        <div className="ag-bbody">
          {tab === "brief" && tenantId ? (
            <BriefTab tenantId={tenantId} agent={agent} />
          ) : tab === "brain" ? (
            <BrainTab
              tenantId={tenantId}
              agent={agent}
              clients={graphClients}
              scope={scope}
              onScope={setScope}
              lessons={lessonList}
              pendingEditIds={lessons.data?.pendingEditIds ?? []}
              loading={lessons.isLoading}
              failed={lessons.isLoadingError}
            />
          ) : (
            building
          )}
        </div>
      </section>
    </div>
  );
}

// The page's styles, lifted from agents-v3.html and scoped to .ag. Colours
// are the admin tokens; the brand family is rebuilt from --brand on .ag itself
// so a client's colour carries through the gradient, tint and text.
function AgentStyle() {
  return (
    <style>{`
      .ag {
        --brand-2: color-mix(in srgb, var(--brand) 72%, white);
        --grad-brand: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
        --shadow-brand: 0 8px 22px color-mix(in srgb, var(--brand) 28%, transparent);
        --brand-tint: color-mix(in srgb, var(--brand) 10%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 88%, black);
        --ag-graph-line: rgba(20,22,31,.12);
        display: flex; flex: 1; min-height: 0; min-width: 0; height: 100%;
        color: var(--text); font-family: var(--font-body);
      }
      [data-theme="dark"] .ag {
        --brand-tint: color-mix(in srgb, var(--brand) 18%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 70%, white);
        --ag-graph-line: rgba(255,255,255,.12);
      }
      .ag *, .ag *::before, .ag *::after { box-sizing: border-box; }
      .ag button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
      .ag button:disabled { cursor: default; opacity: .55; }
      .ag svg { flex-shrink: 0; }
      .ag-empty { padding: 16px 8px; font-size: 13px; color: var(--text-faint); text-align: center; }
      .ag-err { font-size: 12.5px; color: var(--danger); }

      .ag-convos { width: 248px; flex-shrink: 0; border-right: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 55%, transparent); display: flex; flex-direction: column; min-height: 0; }
      .ag-convos-head { padding: 20px 16px 12px; display: flex; align-items: center; gap: 10px; }
      .ag-agent-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: var(--brand-tint); color: var(--brand-text); flex-shrink: 0; }
      .ag-agent-ic svg { width: 18px; height: 18px; }
      .ag-agent-name { font-family: var(--font-display); font-weight: 600; font-size: 16px; letter-spacing: -.02em; line-height: 1.25; }
      .ag .ag-btn-new { margin: 0 16px 12px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 12px; border-radius: 10px; color: #fff; font-size: 13px; font-weight: 600; background-image: var(--grad-brand); box-shadow: var(--shadow-brand); }
      .ag-btn-new svg { width: 15px; height: 15px; }
      .ag-search { margin: 0 16px 10px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 999px; padding: 7px 12px; background: var(--surface); color: var(--text-faint); font-size: 12.5px; }
      .ag-search svg { width: 14px; height: 14px; }
      .ag-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--text); font: inherit; padding: 0; }
      .ag-search input::placeholder { color: var(--text-faint); }
      .ag-search:focus-within { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }
      .ag-clist { flex: 1; overflow-y: auto; padding: 0 10px 16px; }
      .ag-cgroup { padding: 10px 8px 4px; font-size: 12px; font-weight: 500; color: var(--text-faint); }
      .ag .ag-cv { display: block; width: 100%; text-align: left; padding: 9px 10px; border-radius: 10px; margin-bottom: 2px; border: 1px solid transparent; }
      .ag .ag-cv:hover { background: var(--surface-2); }
      .ag .ag-cv.on { background: var(--surface); box-shadow: var(--shadow-sm); border-color: var(--border); }
      .ag-cv-t { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; display: flex; align-items: center; gap: 6px; }
      .ag-cv-t .t { overflow: hidden; text-overflow: ellipsis; }
      .ag-cv-t .auto { font-size: 10px; font-weight: 700; color: var(--brand-text); background: var(--brand-tint); border-radius: 999px; padding: 1px 6px; flex-shrink: 0; }
      .ag-cv-t .from { font-size: 10px; font-weight: 700; color: var(--warning); background: color-mix(in srgb, var(--warning) 14%, transparent); border-radius: 999px; padding: 1px 6px; flex-shrink: 0; }
      .ag-cv-s { font-size: 12px; color: var(--text-faint); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .ag-chat { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
      .ag-chat-head { height: 60px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 24px; border-bottom: 1px solid var(--border); }
      .ag-chat-title { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ag .ag-iconbtn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 72%, transparent); display: grid; place-items: center; color: var(--text-muted); flex-shrink: 0; }
      .ag-iconbtn svg { width: 16px; height: 16px; }
      .ag-chat-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
      .ag-m { max-width: 640px; font-size: 14px; line-height: 1.6; }
      .ag-me-wrap { align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 640px; }
      .ag-m.me { background: var(--surface-2); border-radius: 16px 16px 4px 16px; padding: 10px 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ag-queued { font-size: 11.5px; color: var(--text-faint); }
      .ag-m.ai { display: flex; gap: 12px; }
      .ag-ai-body { min-width: 0; }
      .ag-tx { white-space: pre-wrap; overflow-wrap: anywhere; }
      .ag-md { white-space: normal; }
      .ag-md p, .ag-md ol, .ag-md ul { margin: 0 0 8px; }
      .ag-md > :last-child { margin-bottom: 0; }
      .ag-md ol, .ag-md ul { padding-left: 20px; }
      .ag-md ol { list-style: decimal; }
      .ag-md ul { list-style: disc; }
      .ag-md li { margin: 3px 0; }
      .ag-md strong { font-weight: 600; color: var(--text); }
      .ag-md code { font-size: 0.92em; background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; padding: 0 5px; }
      .ag-md a { color: var(--brand-text); text-decoration: underline; text-underline-offset: 2px; }
      .ag-av { width: 28px; height: 28px; border-radius: 9px; flex-shrink: 0; display: grid; place-items: center; background: var(--grad-brand); color: #fff; }
      .ag-av svg { width: 15px; height: 15px; }
      .ag-used { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; margin-right: 6px; font-size: 12px; color: var(--text-muted); background: var(--brand-tint); border-radius: 999px; padding: 3px 10px; }
      .ag-used svg { width: 12px; height: 12px; color: var(--brand-text); }
      .ag-used.learn { background: color-mix(in srgb, var(--positive) 12%, transparent); }
      .ag-used.learn svg { color: var(--positive); }
      .ag-tool { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-muted); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; background: var(--surface); }
      .ag-tool svg { width: 14px; height: 14px; color: var(--positive); }
      .ag-spin { width: 15px; height: 15px; color: var(--brand-text); animation: agSpin 1.1s linear infinite; }
      .ag-tool .ag-spin { width: 14px; height: 14px; color: var(--brand-text); }
      @keyframes agSpin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .ag-spin { animation: none; } }
      .ag-composer { margin: 0 24px 20px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-md); padding: 12px 12px 10px 16px; flex-shrink: 0; }
      .ag-composer:focus-within { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }
      .ag-composer textarea { display: block; width: 100%; min-height: 44px; max-height: 200px; resize: none; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 14px; line-height: 1.5; padding: 0; }
      .ag-composer textarea::placeholder { color: var(--text-faint); }
      .ag-bar { display: flex; align-items: center; gap: 8px; }
      .ag .ag-send { margin-left: auto; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: #fff; background-image: var(--grad-brand); }
      .ag-send svg { width: 16px; height: 16px; }

      .ag-convos.mini { width: 64px; }
      .ag-convos.mini .ag-convos-head { justify-content: center; padding: 20px 0 12px; }
      .ag .ag-convos.mini .ag-btn-new { margin: 0 12px 12px; padding: 9px 0; }
      .ag-mini-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 0 16px; }
      .ag .ag-mini-cv { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; color: var(--text-faint); border: 1px solid transparent; position: relative; flex-shrink: 0; }
      .ag .ag-mini-cv:hover { background: var(--surface-2); color: var(--text); }
      .ag .ag-mini-cv.on { background: var(--surface); box-shadow: var(--shadow-sm); border-color: var(--border); color: var(--brand-text); }
      .ag-mini-cv svg { width: 16px; height: 16px; }
      .ag-mini-cv .req { position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
      .ag-split { flex: 1; min-width: 0; border-left: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 70%, transparent); display: flex; flex-direction: column; min-height: 0; }

      .ag-build { width: 420px; flex-shrink: 0; border-left: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 70%, transparent); display: flex; flex-direction: column; min-height: 0; }
      .ag-build.wide { width: 520px; }
      .ag-tabs { display: flex; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--border); height: 60px; align-items: flex-end; flex-shrink: 0; }
      .ag .ag-tab { padding: 10px 12px; font-size: 13.5px; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; display: inline-flex; gap: 6px; align-items: center; }
      .ag .ag-tab.on { color: var(--brand-text); border-bottom-color: var(--brand); }
      .ag-tab .ct { font-size: 11px; font-weight: 700; background: var(--surface-2); color: var(--text-muted); border-radius: 999px; padding: 1px 7px; }
      .ag-bbody { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .ag-sec { font-family: var(--font-display); font-size: 14px; font-weight: 600; letter-spacing: -.01em; margin: 6px 2px 0; }
      .ag-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 14px; }
      .ag-card.active { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); box-shadow: 0 0 0 3px var(--brand-tint); }
      .ag-card-top { display: flex; align-items: center; gap: 10px; }
      .ag-card-t { font-family: var(--font-display); font-weight: 600; font-size: 14px; min-width: 0; }
      .ag-pill { margin-left: auto; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
      .ag-p-wip { background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand-text); }
      .ag-p-ok { background: color-mix(in srgb, var(--warning) 14%, transparent); color: var(--warning); }
      .ag-p-live { background: color-mix(in srgb, var(--positive) 12%, transparent); color: var(--positive); }
      .ag-p-bad { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
      .ag-thumbs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
      .ag-thumb { aspect-ratio: 1; border-radius: 10px; background: linear-gradient(135deg, var(--surface-3), var(--surface-2)); position: relative; overflow: hidden; display: block; }
      .ag-thumb img, .ag-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ag-thumb.vid::after { content: ""; position: absolute; inset: 0; margin: auto; width: 0; height: 0; border-left: 14px solid rgba(255,255,255,.9); border-top: 9px solid transparent; border-bottom: 9px solid transparent; }
      .ag-steps { margin-top: 12px; display: flex; flex-direction: column; gap: 7px; }
      .ag-step { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-muted); }
      .ag-step svg { width: 15px; height: 15px; }
      .ag-step.done svg { color: var(--positive); }
      .ag-step.now { color: var(--text); font-weight: 600; }
      .ag-step.now svg { color: var(--brand-text); }
      .ag-quote { margin-top: 10px; font-size: 13.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); white-space: pre-wrap; }
      .ag-actions { display: flex; gap: 8px; margin-top: 12px; }
      .ag .ag-b1 { flex: 1; padding: 8px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #fff; background-image: var(--grad-brand); text-align: center; }
      .ag .ag-b2 { flex: 1; padding: 8px; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none; }
      .ag-b2 svg { width: 14px; height: 14px; }
      .ag-change { margin-top: 12px; }
      .ag-change textarea { display: block; width: 100%; resize: vertical; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font: inherit; font-size: 13px; line-height: 1.5; padding: 8px 10px; outline: 0; }
      .ag-change textarea:focus { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }
      .ag-change .ag-actions { margin-top: 8px; }
      .ag-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
      .ag-stat .v { font-family: var(--font-display); font-weight: 700; font-size: 18px; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .ag-stat .l { font-size: 12px; color: var(--text-muted); font-weight: 500; }
      .ag-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
      .ag-list > div { display: flex; gap: 8px; align-items: flex-start; }
      .ag-list svg { width: 14px; height: 14px; margin-top: 2px; color: var(--brand-text); }
      .ag-progress { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; margin-top: 10px; }
      .ag-progress i { display: block; height: 100%; background: var(--grad-brand); border-radius: 999px; }
      .ag-meta-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 6px; }

      .ag-browser { margin-top: 12px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
      .ag-browser-bar { display: flex; align-items: center; gap: 6px; padding: 7px 10px; background: var(--surface-2); border-bottom: 1px solid var(--border); font-size: 11px; color: var(--text-muted); }
      .ag-browser-bar b { width: 8px; height: 8px; border-radius: 50%; background: var(--border-strong); flex-shrink: 0; }
      .ag-browser-bar span { margin-left: 6px; background: var(--surface); border-radius: 6px; padding: 2px 8px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ag-browser iframe { display: block; width: 100%; height: 300px; border: 0; }

      .ag-brain-top { display: flex; align-items: center; gap: 8px; }
      .ag-graph-wrap { position: relative; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--rail); overflow: hidden; box-shadow: var(--shadow-sm); flex-shrink: 0; }
      .ag-graph-wrap svg { display: block; width: 100%; }
      .ag-legend { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted); background: color-mix(in srgb, var(--surface) 85%, transparent); padding: 5px 9px; border-radius: 999px; border: 1px solid var(--border); }
      .ag-legend span { display: inline-flex; align-items: center; gap: 5px; }
      .ag-legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .ag-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 3px; background: var(--surface); min-width: 0; }
      .ag .ag-seg button { font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; color: var(--text-muted); white-space: nowrap; }
      .ag .ag-seg button.on { background: var(--brand-tint); color: var(--brand-text); }
      .ag-lesson { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
      .ag-lesson .dt { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
      .ag-lesson .tx { font-size: 13px; line-height: 1.45; flex: 1; min-width: 0; }
      .ag-lesson .tx .ag-change { margin-top: 0; }
      .ag-lesson .src { font-size: 11.5px; color: var(--text-faint); margin-top: 3px; }
      .ag .ag-lesson .x { color: var(--text-faint); }
      .ag .ag-lesson .x:hover { color: var(--text); }
      .ag-lesson .x svg { width: 14px; height: 14px; }
      .ag-saving { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }
      .ag-node-label { font-family: var(--font-body); font-size: 10.5px; fill: var(--text-muted); pointer-events: none; }
      .ag-node-label.big { font-family: var(--font-display); font-size: 12px; font-weight: 600; fill: var(--text); }

      .ag-clientrow { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); text-decoration: none; transition: border-color .2s; }
      .ag-clientrow:hover { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }
      .ag-cmark { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: #fff; font-family: var(--font-display); font-weight: 700; font-size: 12px; flex-shrink: 0; overflow: hidden; }
      .ag-cbody { flex: 1; min-width: 0; }
      .ag-cname { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 8px; }
      .ag-cname .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ag-cnext { font-size: 12px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 18px; }
      .ag-agentdots { display: flex; gap: 4px; margin-top: 8px; }
      .ag-agentdots i { width: 18px; height: 6px; border-radius: 999px; background: var(--surface-3); }
      .ag-agentdots i.d { background: var(--positive); }
      .ag-agentdots i.w { background: var(--brand); }
      .ag-agentdots i.s { background: var(--warning); }

      .ag-handoff { max-width: 640px; border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border)); background: color-mix(in srgb, var(--warning) 6%, var(--surface)); border-radius: 14px; padding: 12px 14px; }
      .ag-ho-top { display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .ag-ho-ic { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .ag-ho-ic svg { width: 13px; height: 13px; }
      .ag-ho-tag { font-size: 10.5px; font-weight: 700; color: var(--warning); background: color-mix(in srgb, var(--warning) 14%, transparent); border-radius: 999px; padding: 2px 8px; }
      .ag-ho-time { margin-left: auto; font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }
      .ag-ho-tx { font-size: 14px; line-height: 1.55; margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .ag-ho-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; color: var(--brand-text); text-decoration: none; }
      .ag-ho-link:hover { text-decoration: underline; }
      .ag-ho-link svg { width: 12px; height: 12px; }

      /* Below the desktop frame the three columns stack and the page scrolls. */
      @media (max-width: 1023px) {
        .ag { flex-direction: column; height: auto; }
        .ag-convos, .ag-convos.mini, .ag-build, .ag-build.wide, .ag-split { width: 100%; border: 0; border-bottom: 1px solid var(--border); }
        .ag-convos.mini { flex-direction: row; align-items: center; padding: 8px 12px; gap: 8px; }
        .ag-convos.mini .ag-convos-head { padding: 0; }
        .ag .ag-convos.mini .ag-btn-new { margin: 0; padding: 9px 12px; }
        .ag-mini-list { flex-direction: row; overflow-x: auto; padding: 0; }
        .ag-clist { max-height: 240px; }
        .ag-chat-body { max-height: 60vh; padding: 16px; }
        .ag-chat-head { padding: 0 16px; }
        .ag-composer { margin: 0 16px 16px; }
      }
    `}</style>
  );
}
