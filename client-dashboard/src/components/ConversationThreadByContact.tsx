import { useEffect, useRef } from "react";
import { useConversationMessagesQuery } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";

interface Props {
  contactId: string;
}

const timeFmt = new Intl.DateTimeFormat([], {
  hour: "numeric",
  minute: "2-digit",
});

export default function ConversationThreadByContact({ contactId }: Props) {
  const { session } = useAuth();
  const enabled = Boolean(session);
  const { data, isLoading, error } = useConversationMessagesQuery(
    contactId,
    enabled,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  if (!enabled) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Sign in to view conversation history.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Loading messages...</p>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-rose-600 dark:text-rose-400">
        Could not load messages.
      </p>
    );
  }

  const messages = data?.messages ?? [];
  if (messages.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No messages yet. Send the first one below.
      </p>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {messages.map((m) => {
        const out = m.direction === "outbound";
        const time = (() => {
          const d = new Date(m.at);
          return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
        })();
        return (
          <div
            key={m.id}
            className={`flex ${out ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                out
                  ? "text-white"
                  : "bg-[var(--surface-2)] text-[var(--text)]"
              }`}
              style={out ? { backgroundColor: "var(--brand-primary)" } : undefined}
            >
              {m.body || (m.type !== "SMS" ? `[${m.type}]` : "")}
              <div
                className={`mt-1 text-[10px] ${
                  out ? "text-white/70" : "text-[var(--text-faint)]"
                }`}
              >
                {time}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
