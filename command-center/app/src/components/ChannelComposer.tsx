import {
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import BrandedButton from "./BrandedButton";
import { haptic } from "../lib/haptics";
import { useChannelFilter } from "../context/ChannelFilterContext";

const MAX_CHARS = 5000;
const WARN_CHARS = 1400;

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

function label(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

export interface SendChannelInput {
  channel: string;
  body: string;
  subject?: string;
}

interface Props {
  availableChannels: string[];
  defaultChannel: string;
  isPending: boolean;
  error: Error | null;
  // SMS is unavailable when the contact has no phone; other channels still work.
  smsDisabled?: boolean;
  // When set, the composer is locked to this one channel (the inbox page's
  // channel): no channel chips render and every send goes over it, so an SMS
  // page never sends over Email and no other medium leaks in.
  lockChannel?: string;
  onSend: (input: SendChannelInput) => Promise<unknown>;
}

export default function ChannelComposer({
  availableChannels,
  defaultChannel,
  isPending,
  error,
  smsDisabled,
  lockChannel,
  onSend,
}: Props) {
  const channels = lockChannel
    ? [lockChannel]
    : availableChannels.length > 0
      ? availableChannels
      : ["SMS", "Email"];
  // The active channel is shared with the thread (see ChannelFilterContext):
  // tapping a chip both retargets the send and filters the history shown above.
  // `selected` is null until the user taps, so we fall back to the default. A
  // locked channel wins over both (single-channel inbox page).
  const { selected, select } = useChannelFilter();
  const channel = lockChannel ?? selected ?? defaultChannel;
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");

  const isEmail = channel === "Email";
  const blocked = channel === "SMS" && smsDisabled;
  const canSend =
    !!text.trim() &&
    !isPending &&
    !blocked &&
    (!isEmail || subject.trim().length > 0);

  const submit = () => {
    if (!canSend) return;
    haptic();
    onSend({
      channel,
      body: text.trim(),
      subject: isEmail ? subject.trim() : undefined,
    }).then(() => {
      setText("");
      setSubject("");
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isEmail) {
      e.preventDefault();
      submit();
    }
  };

  const count = text.length;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {!lockChannel && channels.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => select(c)}
              aria-pressed={channel === c}
              className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
              style={{
                background:
                  channel === c ? "var(--brand-primary)" : "var(--surface-2)",
                color: channel === c ? "#fff" : "var(--text-muted)",
              }}
            >
              {label(c)}
            </button>
          ))}
        </div>
      )}

      {isEmail && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]"
        />
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={onKeyDown}
        placeholder={isEmail ? "Write an email" : "Type a message"}
        rows={2}
        disabled={isPending}
        className="resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] disabled:opacity-60"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-muted)]">
          {count >= WARN_CHARS ? `${count} / ${MAX_CHARS}` : ""}
        </span>
        <BrandedButton
          type="submit"
          variant="primary"
          disabled={!canSend}
          className="ml-auto"
        >
          {isPending ? "Sending..." : `Send ${label(channel)}`}
        </BrandedButton>
      </div>

      {blocked && (
        <p className="text-xs text-[var(--text-muted)]">
          No phone number on file. Pick another channel to reach this contact.
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Send failed: {error.message}
        </p>
      )}
    </form>
  );
}
