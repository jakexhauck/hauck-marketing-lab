import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useSendConversationSms } from "../hooks/useApi";
import BrandedButton from "./BrandedButton";

interface Props {
  contactId: string;
  disabled?: boolean;
}

const MAX_CHARS = 1600;
const WARN_CHARS = 1400;

export default function MessageComposerByContact({ contactId, disabled }: Props) {
  const [text, setText] = useState("");
  const send = useSendConversationSms();

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending || disabled) return;
    send.mutate(
      { contactId, body: trimmed },
      {
        onSuccess: () => setText(""),
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const count = text.length;
  const error = send.error as Error | null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={onKeyDown}
        placeholder="Type a message"
        rows={2}
        disabled={disabled || send.isPending}
        className="resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-muted)]">
          {count >= WARN_CHARS ? `${count} / ${MAX_CHARS}` : ""}
        </span>
        <BrandedButton
          type="submit"
          variant="primary"
          disabled={!text.trim() || send.isPending || disabled}
          className="ml-auto"
        >
          {send.isPending ? "Sending..." : "Send SMS"}
        </BrandedButton>
      </div>
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Send failed: {error.message}
        </p>
      )}
    </form>
  );
}
