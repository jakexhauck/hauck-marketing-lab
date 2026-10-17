import { useMemo, useState } from "react";
import { Inbox, MessageSquare, Search, SquarePen, Zap, type LucideIcon } from "lucide-react";
import type { ChatSummary } from "../../../lib/agentWire";
import { groupChats } from "../../../lib/agentView";

// The left column: agent name, New chat, search, chats grouped by day. Mini
// (layout B, beside the Client Brief) shrinks it to icons: the agent, New chat
// and one button per chat, its title on hover.
export default function ChatList({
  name,
  icon: Icon,
  chats,
  loading,
  failed,
  selectedId,
  onSelect,
  onNew,
  newBusy,
  mini = false,
}: {
  name: string;
  icon: LucideIcon;
  chats: ChatSummary[];
  loading: boolean;
  failed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  newBusy: boolean;
  mini?: boolean;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? chats.filter((c) => c.title.toLowerCase().includes(needle) || c.lastLine.toLowerCase().includes(needle))
      : chats;
    return groupChats(hits, new Date());
  }, [chats, q]);

  if (mini) {
    const sorted = groups.flatMap((g) => g.chats);
    return (
      <section className="ag-convos mini">
        <div className="ag-convos-head" title={name}>
          <div className="ag-agent-ic">
            <Icon />
          </div>
        </div>
        <button
          type="button"
          className="ag-btn-new"
          onClick={onNew}
          disabled={newBusy}
          aria-label="New chat"
          title="New chat"
        >
          <SquarePen />
        </button>
        <div className="ag-mini-list">
          {sorted.map((c) => {
            const ChatIcon = c.hasRequest ? Inbox : c.auto ? Zap : MessageSquare;
            return (
              <button
                key={c.id}
                type="button"
                className={`ag-mini-cv${c.id === selectedId ? " on" : ""}`}
                onClick={() => onSelect(c.id)}
                aria-current={c.id === selectedId ? "true" : undefined}
                aria-label={c.title}
                title={c.title}
              >
                <ChatIcon />
                {c.hasRequest && <i className="req" />}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="ag-convos">
      <div className="ag-convos-head">
        <div className="ag-agent-ic">
          <Icon />
        </div>
        <div className="ag-agent-name">{name}</div>
      </div>
      <button type="button" className="ag-btn-new" onClick={onNew} disabled={newBusy}>
        <SquarePen />
        New chat
      </button>
      <label className="ag-search">
        <Search />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
      </label>
      <div className="ag-clist">
        {loading ? (
          <div className="ag-empty">Loading...</div>
        ) : failed ? (
          <div className="ag-empty">Chats did not load.</div>
        ) : groups.length === 0 ? (
          <div className="ag-empty">{q ? "No matches" : "No chats"}</div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="ag-cgroup">{g.label}</div>
              {g.chats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`ag-cv${c.id === selectedId ? " on" : ""}`}
                  onClick={() => onSelect(c.id)}
                  aria-current={c.id === selectedId ? "true" : undefined}
                >
                  <div className="ag-cv-t">
                    {c.hasRequest ? (
                      <span className="from">Request</span>
                    ) : c.auto ? (
                      <span className="auto">Auto</span>
                    ) : null}
                    <span className="t">{c.title}</span>
                  </div>
                  {c.lastLine && <div className="ag-cv-s">{c.lastLine}</div>}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
