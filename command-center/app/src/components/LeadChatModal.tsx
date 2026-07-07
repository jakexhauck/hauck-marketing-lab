import { useEffect } from "react";
import { X } from "lucide-react";
import Avatar from "./Avatar";
import ConversationThread from "./ConversationThread";
import MessageComposer from "./MessageComposer";
import { ChannelFilterProvider } from "../context/ChannelFilterContext";

// Centered popup to converse with a lead from any pipeline card. Reuses the
// wired conversation stack: the thread and composer share one ChannelFilter, so
// switching a channel chip in the composer filters the thread and retargets the
// send. Available channels and the default open channel come per-lead from the
// messaging feed, so a prospect who only ever texted shows a single channel.
export default function LeadChatModal({
  leadId,
  leadName,
  hasPhone = true,
  onClose,
}: {
  leadId: string;
  leadName: string;
  hasPhone?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.5)] p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversation with ${leadName}`}
    >
      <div
        className="flex h-[min(640px,88vh)] w-[min(470px,95vw)] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Contact header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Avatar name={leadName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-semibold text-[var(--text)]">
              {leadName}
            </div>
            <div className="text-[11.5px] text-[var(--text-faint)]">Conversation</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            <X size={17} />
          </button>
        </div>

        {/* Reused conversation stack: thread + channel-aware composer */}
        <ChannelFilterProvider key={leadId}>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <ConversationThread leadId={leadId} fill />
            <div className="mt-auto">
              <MessageComposer leadId={leadId} disabled={!hasPhone} />
            </div>
          </div>
        </ChannelFilterProvider>
      </div>
    </div>
  );
}
