import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, BrainCircuit, CircleCheck, Loader, Sparkles } from "lucide-react";
import type { AgentItem, AgentMessage } from "../../../lib/agentWire";
import { messageView } from "../../../lib/agentView";
import RequestCard from "./RequestCard";
import { useAgentMessages, type ItemAction } from "./agentApi";

// The middle column: the chat's messages and the composer. Sending with no
// chat open starts one first (onEnsureChat), so the composer always works.
export default function ChatThread({
  chatId,
  title,
  agentName,
  items,
  onAction,
  actionBusy,
  onEnsureChat,
  onSend,
  sending,
}: {
  chatId: string | null;
  title: string;
  agentName: string;
  items: AgentItem[];
  onAction: (itemId: string, action: ItemAction, note?: string) => void;
  actionBusy: boolean;
  onEnsureChat: () => Promise<string>;
  onSend: (chatId: string, body: string) => Promise<unknown>;
  sending: boolean;
}) {
  const messages = useAgentMessages(chatId);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const list = messages.data?.messages ?? [];
  const now = new Date();

  // Stay pinned to the newest message as replies stream in.
  const last = list[list.length - 1];
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatId, list.length, last?.body, last?.status]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setErr(null);
    try {
      const id = chatId ?? (await onEnsureChat());
      await onSend(id, text);
      setDraft("");
    } catch (e) {
      setErr((e as Error).message || "Not sent");
    }
  };

  const itemById = (id: string | null) => (id ? (items.find((i) => i.id === id) ?? null) : null);

  return (
    <section className="ag-chat">
      <div className="ag-chat-head">
        <div className="ag-chat-title">{title}</div>
      </div>
      <div className="ag-chat-body" ref={body}>
        {chatId && messages.isLoading ? (
          <div className="ag-empty">Loading...</div>
        ) : chatId && messages.isLoadingError ? (
          <div className="ag-empty">Messages did not load.</div>
        ) : list.length === 0 ? (
          <div className="ag-empty">No messages</div>
        ) : (
          list.map((m) => {
            if (m.role === "request") {
              const item = itemById(m.itemId);
              return (
                <RequestCard
                  key={m.id}
                  msg={m}
                  item={item}
                  now={now}
                  busy={actionBusy}
                  onAction={(action, note) => item && onAction(item.id, action, note)}
                />
              );
            }
            if (m.role === "me") return <MeMessage key={m.id} msg={m} />;
            return <AiMessage key={m.id} msg={m} />;
          })
        )}
      </div>
      <form
        className="ag-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Message the ${agentName}`}
          aria-label={`Message the ${agentName}`}
          rows={2}
        />
        <div className="ag-bar">
          {err && <span className="ag-err">{err}</span>}
          <button type="submit" className="ag-send" disabled={!draft.trim() || sending} aria-label="Send">
            <ArrowUp />
          </button>
        </div>
      </form>
    </section>
  );
}

function MeMessage({ msg }: { msg: AgentMessage }) {
  return (
    <div className="ag-me-wrap">
      <div className="ag-m me">{msg.body}</div>
      {msg.status === "queued" && <div className="ag-queued">Queued</div>}
    </div>
  );
}

function AiMessage({ msg }: { msg: AgentMessage }) {
  const v = messageView(msg);
  return (
    <div className="ag-m ai">
      <div className="ag-av">
        <Sparkles />
      </div>
      <div className="ag-ai-body">
        {msg.body && <div className="ag-tx">{msg.body}</div>}
        {v.pending && !msg.body && <Loader className="ag-spin" aria-label="Working" />}
        {msg.status === "error" && <div className="ag-err">{msg.error || "Failed"}</div>}
        {v.chips.length > 0 && (
          <div>
            {v.chips.map((c, i) => (
              <span key={i} className={`ag-used${c.kind === "learned" ? " learn" : ""}`}>
                {c.kind === "learned" ? <BrainCircuit /> : <Brain />}
                {c.text}
              </span>
            ))}
          </div>
        )}
        {v.tools.map((t, i) => (
          <div key={i} className="ag-tool">
            {v.pending && i === v.tools.length - 1 ? <Loader className="ag-spin" /> : <CircleCheck />}
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}
