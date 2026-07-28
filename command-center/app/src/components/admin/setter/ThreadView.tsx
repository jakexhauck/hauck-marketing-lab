import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { formatMessageStamp, isOutbound } from "../../../lib/setterInbox";
import { toPlainText } from "../../../lib/plainText";
import type { ApiSetterMessage } from "../../../lib/api";

interface Props {
  messages: ApiSetterMessage[];
  status: "loading" | "failed" | "ready";
  onRetry: () => void;
}

// The conversation itself, oldest at the top. Outbound (what the client sent,
// including anything a setter sends from the composer below) sits right and
// tinted; inbound sits left. Loading, failed and empty are three separate
// renders: an in-flight or errored fetch must never read as "this customer has
// said nothing", which would send a setter into a call blind while believing
// they had the full history.
export default function ThreadView({ messages, status, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Land on the newest message, and follow it when a send lands.
  useEffect(() => {
    if (status !== "ready") return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [status, messages.length]);

  if (status === "loading") {
    return (
      <div className="flex-1 px-4 py-10 text-center text-[13px] text-muted">
        Loading this conversation...
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex-1 p-4">
        <div className="rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-3 py-3">
          <p className="flex items-start gap-1.5 text-[12.5px] text-danger">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            Could not load this conversation. Do not assume it is empty.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand/40 hover:text-brand-text"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 px-4 py-10 text-center text-[13px] text-faint">
        No messages with this contact yet. Anything you send below is the first.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => {
          const out = isOutbound(m.direction);
          return (
            <li key={m.id} className={"flex " + (out ? "justify-end" : "justify-start")}>
              <div
                className={
                  "max-w-[min(78%,520px)] rounded-[var(--radius-lg)] border px-3.5 py-2.5 " +
                  (out
                    ? "border-brand/30 bg-brand-tint"
                    : "border-border bg-surface-2")
                }
              >
                {/* Emails arrive as HTML; SMS does not. Flattened either way,
                    so a marketing email never renders its markup as text in
                    the middle of a conversation. */}
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">
                  {toPlainText(m.body) || <span className="text-faint">No message text</span>}
                </p>
                <div
                  className={
                    "mt-1.5 flex items-center gap-2 text-[10.5px] text-faint " +
                    (out ? "justify-end" : "")
                  }
                >
                  {m.channel && (
                    <span className="font-semibold uppercase tracking-wide">{m.channel}</span>
                  )}
                  <span className="font-data">{formatMessageStamp(m.sentAt)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} />
    </div>
  );
}
