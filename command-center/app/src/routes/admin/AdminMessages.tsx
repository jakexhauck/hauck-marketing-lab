import { useState, useRef, useEffect } from "react";
import {
  useAdminThreads,
  useAdminThreadMessages,
  useAdminSendMessage,
} from "../../hooks/useChat";
import type { AdminHauckThread } from "../../lib/api";

// Admin Hauck Inbox. Left pane: thread list across all tenants.
// Right pane: conversation + composer for the selected thread.
// No DesktopPage wrapper here -- the two-pane layout IS the page shell.

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: AdminHauckThread;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full px-4 py-3.5 text-left transition-colors border-b border-divider",
        selected
          ? "bg-brand-tint"
          : "hover:bg-surface-2",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={[
                "font-display text-[14px] font-semibold truncate",
                selected ? "text-brand-text" : "text-text",
              ].join(" ")}
            >
              {thread.personName}
            </span>
            {thread.unread > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-brand text-brand-fg text-[10.5px] font-bold grid place-items-center px-1">
                {thread.unread > 99 ? "99+" : thread.unread}
              </span>
            )}
          </div>
          <div className="text-[12px] text-muted truncate mt-0.5">
            {thread.tenantName}
          </div>
        </div>
        {thread.lastMessageAt && (
          <span className="shrink-0 text-[11.5px] text-faint mt-0.5">
            {formatRelative(thread.lastMessageAt)}
          </span>
        )}
      </div>
    </button>
  );
}

function Conversation({ channelId }: { channelId: string }) {
  const { data: messages, isLoading } = useAdminThreadMessages(channelId);
  const { mutate: send, isPending } = useAdminSendMessage(channelId);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages load or a new one arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  function handleSend() {
    const body = draft.trim();
    if (!body || isPending) return;
    setDraft("");
    send(body);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted">
        Loading...
      </div>
    );
  }

  const msgs = messages ?? [];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
        {msgs.length === 0 && (
          <div className="text-center text-[13px] text-muted py-12">
            No messages yet. Start the conversation.
          </div>
        )}
        {msgs.map((msg) => {
          const isAdmin = msg.senderKind === "admin";
          return (
            <div
              key={msg.id}
              className={[
                "flex flex-col max-w-[70%]",
                isAdmin ? "ml-auto items-end" : "items-start",
              ].join(" ")}
            >
              {!isAdmin && (
                <span className="text-[11.5px] text-muted mb-1 font-medium">
                  {msg.senderName}
                </span>
              )}
              <div
                className={[
                  "rounded-[14px] px-4 py-2.5 text-[14px] leading-relaxed break-words",
                  isAdmin
                    ? "bg-brand text-brand-fg rounded-br-[4px]"
                    : "bg-surface-2 text-text border border-border rounded-bl-[4px]",
                ].join(" ")}
              >
                {msg.body}
              </div>
              <span className="text-[11px] text-faint mt-1">
                {formatTime(msg.createdAt)}
                {msg.editedAt && " (edited)"}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-surface px-5 py-4">
        <div className="flex items-end gap-3">
          <textarea
            className="flex-1 resize-none rounded-[var(--radius)] border border-border bg-bg px-3 py-2.5 text-[14px] text-text placeholder:text-faint outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors min-h-[40px] max-h-[160px]"
            placeholder="Reply as Hauck... (Enter to send)"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || isPending}
            className="shrink-0 h-[38px] px-4 rounded-[var(--radius)] bg-brand text-brand-fg text-[13.5px] font-semibold transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            {isPending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminMessages() {
  const { data: threads, isLoading } = useAdminThreads();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const threadList = threads ?? [];

  // Auto-select the first thread when the list loads (if nothing is selected).
  useEffect(() => {
    if (!selectedId && threadList.length > 0) {
      setSelectedId(threadList[0].channelId);
    }
  }, [threadList.length, selectedId]);

  const selectedThread = threadList.find((t) => t.channelId === selectedId) ?? null;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left pane: thread list */}
      <aside className="w-[280px] shrink-0 flex flex-col border-r border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-[16px] font-semibold text-text tracking-[-0.01em]">
            Inbox
          </h2>
          <p className="text-[12px] text-muted mt-0.5">Hauck conversations</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="text-center text-[13px] text-muted py-8">
              Loading...
            </div>
          )}
          {!isLoading && threadList.length === 0 && (
            <div className="text-center text-[13px] text-muted py-8 px-4">
              No conversations yet.
            </div>
          )}
          {threadList.map((thread) => (
            <ThreadRow
              key={thread.channelId}
              thread={thread}
              selected={thread.channelId === selectedId}
              onSelect={() => setSelectedId(thread.channelId)}
            />
          ))}
        </div>
      </aside>

      {/* Right pane: conversation */}
      <div className="flex flex-1 flex-col min-h-0 min-w-0 bg-bg">
        {selectedThread ? (
          <>
            {/* Pane header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/80 px-6 py-4 backdrop-blur">
              <div className="min-w-0">
                <h1 className="font-display text-[18px] font-bold leading-tight text-text">
                  {selectedThread.personName}
                </h1>
                <p className="text-[12.5px] text-muted mt-0.5">
                  {selectedThread.tenantName}
                </p>
              </div>
            </div>
            <Conversation channelId={selectedThread.channelId} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="text-[15px] font-semibold text-muted">
                No conversation selected
              </div>
              <div className="text-[13px] text-faint mt-1">
                Pick a thread from the left panel.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
