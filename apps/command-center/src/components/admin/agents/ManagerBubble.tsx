import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Gauge, Plus, X } from "lucide-react";
import { BUBBLE_KEY, bubbleOpen, hideBubbleOn } from "../../../lib/managerBubble";
import ChatThread from "./ChatThread";
import { AgentStyle } from "./AgentPage";
import { useAgentChats, useAgentItems, useItemAction, useNewChat, useSendMessage, type ItemAction } from "./agentApi";

// The agency Manager in the corner of every admin page (Jake, 2026-10-20;
// docs/build-plans/four-agents-and-handoffs.md). Mounted once in AdminLayout,
// so it stays open across page changes. The same chats as /admin/agents/manager,
// which keeps the Clients and Mega Brain tabs; the bubble is only the chat.

const AGENCY = "agency";

function readOpen(): boolean {
  try {
    return bubbleOpen(localStorage.getItem(BUBBLE_KEY));
  } catch {
    return false;
  }
}

function saveOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(BUBBLE_KEY, "1");
    else localStorage.removeItem(BUBBLE_KEY);
  } catch {
    // Storage blocked: the bubble just forgets.
  }
}

export default function ManagerBubble() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(readOpen);
  const toggle = (next: boolean) => {
    setOpen(next);
    saveOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      saveOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hideBubbleOn(pathname)) return null;
  return (
    <>
      <BubbleStyle />
      {open && <BubblePanel onClose={() => toggle(false)} />}
      <button
        type="button"
        className="mb-fab"
        aria-label={open ? "Close the Manager" : "Open the Manager"}
        aria-expanded={open}
        onClick={() => toggle(!open)}
      >
        {open ? <X size={22} /> : <Gauge size={22} />}
      </button>
    </>
  );
}

function BubblePanel({ onClose }: { onClose: () => void }) {
  const chats = useAgentChats(AGENCY, "manager");
  const newChat = useNewChat(AGENCY, "manager");
  const send = useSendMessage(AGENCY, "manager");
  const items = useAgentItems(AGENCY);
  const act = useItemAction(AGENCY);
  const allItems = useMemo(() => items.data?.items ?? [], [items.data]);

  const list = useMemo(
    () => [...(chats.data ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [chats.data],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const selected = list.find((c) => c.id === picked) ?? list[0] ?? null;

  const startChat = async () => {
    const chat = await newChat.mutateAsync();
    setPicked(chat.id);
    return chat.id;
  };
  const onAction = (itemId: string, action: ItemAction, note?: string) =>
    act.mutate({ id: itemId, action, note, payloadHash: allItems.find((i) => i.id === itemId)?.payloadHash });

  return (
    <div className="ag mb-panel" role="dialog" aria-label="Manager">
      <AgentStyle />
      <div className="mb-head">
        <select
          className="mb-pick"
          aria-label="Chat"
          value={selected?.id ?? ""}
          onChange={(e) => setPicked(e.target.value)}
          disabled={list.length === 0}
        >
          {list.length === 0 && <option value="">New chat</option>}
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title || "Chat"}
            </option>
          ))}
        </select>
        <button type="button" className="mb-icon" aria-label="New chat" disabled={newChat.isPending} onClick={() => void startChat().catch(() => undefined)}>
          <Plus size={17} />
        </button>
        <button type="button" className="mb-icon" aria-label="Close" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <ChatThread
        key={selected?.id ?? "none"}
        chatId={selected?.id ?? null}
        title={selected?.title ?? "New chat"}
        agentName="Manager Agent"
        items={allItems}
        onAction={onAction}
        actionBusy={act.isPending}
        onEnsureChat={startChat}
        onSend={(chatId, body) => send.mutateAsync({ chatId, body })}
        sending={send.isPending || newChat.isPending}
      />
    </div>
  );
}

function BubbleStyle() {
  return (
    <style>{`
      .mb-fab {
        position: fixed; right: 16px; bottom: calc(16px + 62px + env(safe-area-inset-bottom, 0px)); z-index: 60;
        width: 52px; height: 52px; border-radius: 999px; display: grid; place-items: center;
        color: #fff; background-image: var(--grad-brand); box-shadow: var(--shadow-brand);
        border: 0; cursor: pointer; transition: transform .16s ease;
      }
      .mb-fab:active { transform: scale(.96); }
      .ag.mb-panel {
        position: fixed; right: 16px; bottom: calc(80px + 62px + env(safe-area-inset-bottom, 0px)); z-index: 60;
        width: min(380px, calc(100vw - 32px)); height: min(70vh, 640px); height: min(70dvh, 640px);
        flex-direction: column; border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
        background: var(--bg); box-shadow: 0 18px 48px rgba(0,0,0,.18);
      }
      .mb-panel .ag-chat-head { display: none; }
      .mb-panel .ag-chat-body { max-height: none; padding: 16px; }
      .mb-panel .ag-composer { margin: 0 12px 12px; }
      .mb-head { display: flex; align-items: center; gap: 6px; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
      .mb-pick { flex: 1; min-width: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--text); background: transparent; border: 0; padding: 4px 0; text-overflow: ellipsis; }
      .mb-icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: var(--text-muted); }
      .mb-icon:hover { background: color-mix(in srgb, var(--text-muted) 12%, transparent); color: var(--text); }
      @media (min-width: 1024px) {
        .mb-fab { bottom: 20px; right: 20px; }
        .ag.mb-panel { bottom: 84px; right: 20px; }
      }
      @media (max-width: 639px) {
        .ag.mb-panel { left: 16px; width: auto; }
      }
      @media (prefers-reduced-motion: reduce) { .mb-fab { transition: none; } }
    `}</style>
  );
}
