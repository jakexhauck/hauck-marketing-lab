import { useState, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Send, Paperclip } from "lucide-react";
import { useSendMessage } from "../../hooks/useChat";

export default function Composer({ channelId }: { channelId: string }) {
  const [body, setBody] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessage();

  const send = () => {
    const text = body.trim();
    if (!text || sendMessage.isPending) return;
    sendMessage.mutate({ channelId, body: text });
    setBody("");
    taRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-[var(--divider)] bg-[var(--surface)] p-2.5">
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 focus-within:border-[var(--brand-primary)]">
        {/* Attachment upload is wired in Phase 08. The control is rendered now so the
            composer layout is stable; it is disabled and intentionally has no handler. */}
        <button
          type="button"
          disabled
          aria-label="Attach a file (coming soon)"
          title="Attachments arrive in a later update"
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] disabled:cursor-not-allowed"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Write a message"
          className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!body.trim() || sendMessage.isPending}
          aria-label="Send message"
          className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40"
          style={{ color: "var(--brand-primary)" }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
