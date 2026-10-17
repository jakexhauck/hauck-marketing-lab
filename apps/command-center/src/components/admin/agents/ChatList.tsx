import { useMemo, useState } from "react";
import { Search, SquarePen, type LucideIcon } from "lucide-react";
import type { ChatSummary } from "../../../lib/agentWire";
import { groupChats } from "../../../lib/agentView";

// The left column: agent name, New chat, search, chats grouped by day.
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
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = needle
      ? chats.filter((c) => c.title.toLowerCase().includes(needle) || c.lastLine.toLowerCase().includes(needle))
      : chats;
    return groupChats(hits, new Date());
  }, [chats, q]);

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
                    {c.hasRequest ? <span className="from">Request</span> : c.auto ? <span className="auto">Auto</span> : null}
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
