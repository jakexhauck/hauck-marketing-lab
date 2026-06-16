import { useEffect, useRef } from "react";
import { MessageSquare, Mail, Phone, StickyNote } from "lucide-react";
import type { ApiMessage } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatTime, formatDate } from "@/lib/format";
import { LoadingState, EmptyState } from "@/components/ui";

function channelIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("call")) return Phone;
  if (t.includes("note") || t.includes("activity")) return StickyNote;
  return MessageSquare;
}

function dayKey(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
}

// Presentational message thread shared by the lead drawer and the inbox.
export function MessageThread({
  messages,
  loading,
  className,
}: {
  messages: ApiMessage[];
  loading?: boolean;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (loading && messages.length === 0) return <LoadingState label="Loading messages" />;
  if (messages.length === 0)
    return (
      <EmptyState
        icon={<MessageSquare size={22} />}
        title="No messages yet"
        description="Start the conversation with the composer below."
      />
    );

  let lastDay = "";
  return (
    <div className={cn("flex flex-col gap-1 px-4 py-4", className)}>
      {messages.map((m) => {
        const out = m.direction?.toLowerCase() === "outbound";
        const day = dayKey(m.at);
        const showDay = day && day !== lastDay;
        lastDay = day;
        const Icon = channelIcon(m.type);
        return (
          <div key={m.id}>
            {showDay && (
              <div className="my-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-divider" />
                <span className="font-data text-[10.5px] uppercase tracking-wider text-faint">
                  {formatDate(m.at, { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="h-px flex-1 bg-divider" />
              </div>
            )}
            <div className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "group max-w-[78%] rounded-[var(--radius-lg)] px-3.5 py-2",
                  out
                    ? "bg-brand text-brand-fg rounded-br-sm"
                    : "border border-border bg-surface-2 text-text rounded-bl-sm",
                )}
              >
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
                  {m.body || <span className="italic opacity-70">(no text)</span>}
                </p>
                <div
                  className={cn(
                    "mt-1 flex items-center gap-1.5 text-[10.5px]",
                    out ? "text-brand-fg/70" : "text-faint",
                  )}
                >
                  <Icon size={11} />
                  <span className="font-data">{formatTime(m.at)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
