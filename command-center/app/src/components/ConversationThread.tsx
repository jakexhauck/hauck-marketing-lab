import { useEffect, useRef } from "react";
import {
  useConversationMessagesQuery,
  useMessagesQuery,
} from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { useChannelFilter } from "../context/ChannelFilterContext";

// One thread component for both data sources: a lead id (LeadDetail embed)
// or a contact id (ConversationDetail full screen). Exactly one of the two
// id props should be set; `fill` switches between the embedded max-height
// box and filling the available column.
interface Props {
  leadId?: string;
  contactId?: string;
  fill?: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  SMS: "SMS",
  Email: "Email",
  FB: "Facebook",
  IG: "Instagram",
  GMB: "Google",
  WhatsApp: "WhatsApp",
  Live_Chat: "Live Chat",
  Custom: "Custom",
};

function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

const timeFmt = new Intl.DateTimeFormat([], {
  hour: "numeric",
  minute: "2-digit",
});

const fullDateFmt = new Intl.DateTimeFormat([], {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const datedFmt = new Intl.DateTimeFormat([], {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

// iMessage-style day separator: "Today" / "Yesterday" for the recent days, the
// weekday + date inside the current year, and the full dated form once the year
// differs. Returns "" for an unparseable timestamp so the row is simply skipped.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOf(now) - startOf(d)) / dayMs);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (d.getFullYear() === now.getFullYear()) return fullDateFmt.format(d);
  return datedFmt.format(d);
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function ConversationThread({ leadId, contactId, fill }: Props) {
  const { session } = useAuth();
  const enabled = Boolean(session);
  // Hooks run unconditionally; the enabled flags pick the active source.
  const leadQuery = useMessagesQuery(leadId ?? null, enabled && !!leadId);
  const contactQuery = useConversationMessagesQuery(
    contactId ?? null,
    enabled && !!contactId,
  );
  const { data, isLoading, error } = leadId ? leadQuery : contactQuery;
  const { selected } = useChannelFilter();
  const bottomRef = useRef<HTMLDivElement>(null);

  // The channel whose history is shown: the user's pick, else the thread's
  // default (last channel the contact used), else SMS.
  const activeChannel = selected ?? data?.defaultChannel ?? "SMS";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length, activeChannel]);

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

  const allMessages = data?.messages ?? [];
  // Show only the active channel's back-and-forth, so switching SMS -> Email
  // swaps the texts for the email history (and vice versa).
  const messages = allMessages.filter((m) => m.type === activeChannel);

  if (allMessages.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No messages yet. Send the first one below.
      </p>
    );
  }
  if (messages.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No {channelLabel(activeChannel)} history with this contact yet.
      </p>
    );
  }

  let lastDay = "";
  return (
    <div
      className={
        "flex flex-col gap-2 overflow-y-auto pr-1 " +
        (fill ? "flex-1" : "max-h-80")
      }
    >
      {messages.map((m) => {
        const out = m.direction === "outbound";
        const d = new Date(m.at);
        const valid = !Number.isNaN(d.getTime());
        const time = valid ? timeFmt.format(d) : "";
        // Insert a centered date divider whenever the calendar day changes.
        const key = dayKey(m.at);
        const showDay = key !== "" && key !== lastDay;
        if (showDay) lastDay = key;
        return (
          <div key={m.id} className="flex flex-col gap-2">
            {showDay && (
              <div className="py-1 text-center text-[11px] font-semibold text-[var(--text-faint)]">
                {dayLabel(m.at)}
              </div>
            )}
            <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  out
                    ? "text-white"
                    : "bg-[var(--surface-2)] text-[var(--text)]"
                }`}
                style={
                  out ? { backgroundColor: "var(--brand-primary)" } : undefined
                }
              >
                {m.body || (m.type !== "SMS" ? `[${m.type}]` : "")}
                <div
                  className={`mt-1 text-[11px] ${
                    out ? "text-white/70" : "text-[var(--text-faint)]"
                  }`}
                >
                  {time}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
