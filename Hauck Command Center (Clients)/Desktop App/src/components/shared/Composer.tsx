import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";

function channelLabel(c: string) {
  const t = c.toLowerCase();
  if (t.includes("email")) return "Email";
  if (t.includes("sms")) return "SMS";
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

// Channel-aware message composer shared by the lead drawer and inbox. The parent
// owns the actual send mutation; this only collects channel + subject + body.
export function Composer({
  availableChannels,
  defaultChannel,
  onSend,
  sending,
  disabled,
}: {
  availableChannels?: string[];
  defaultChannel?: string;
  onSend: (vars: { body: string; channel: string; subject?: string }) => void | Promise<void>;
  sending?: boolean;
  disabled?: boolean;
}) {
  const channels = availableChannels && availableChannels.length > 0 ? availableChannels : ["SMS"];
  const [channel, setChannel] = useState(defaultChannel || channels[0]);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const isEmail = channel.toLowerCase().includes("email");

  const canSend = body.trim().length > 0 && !sending && !disabled;

  async function submit() {
    if (!canSend) return;
    await onSend({ body: body.trim(), channel, subject: isEmail ? subject.trim() : undefined });
    setBody("");
    setSubject("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      {channels.length > 1 && (
        <div className="mb-2 flex items-center gap-1">
          {channels.map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                c === channel
                  ? "bg-brand-tint text-brand-text"
                  : "text-faint hover:bg-surface-2 hover:text-muted",
              )}
            >
              {channelLabel(c)}
            </button>
          ))}
        </div>
      )}
      {isEmail && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="mb-2 h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
        />
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? "Messaging unavailable" : `Message via ${channelLabel(channel)}…`}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <Button variant="primary" size="icon" onClick={submit} loading={sending} disabled={!canSend} aria-label="Send">
          {!sending && <Send size={16} />}
        </Button>
      </div>
    </div>
  );
}
