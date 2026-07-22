import { useState } from "react";
import { Loader2, Send, TriangleAlert } from "lucide-react";
import { Segmented } from "../../ui";
import { useSetterSendMutation } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import {
  SEND_CHANNELS,
  defaultChannelFor,
  sendBlockReason,
  sendErrorMessage,
  type SendChannel,
} from "../../../lib/setterInbox";

interface Props {
  tenantId: string;
  contactId: string;
  contactName: string;
  // The thread's own last message type, which decides where the composer opens:
  // reply where they reached you.
  lastMessageType: string | null;
}

// The composer sends a REAL message to a REAL customer under the client's name.
// There is no undo, no approval step, and the recipient cannot tell it did not
// come from the client themselves. Three things follow from that and none of
// them are cosmetic:
//
//   1. Send is disabled while the mutation is pending, so a double-click cannot
//      put the same text in front of the customer twice. A duplicate text from
//      a business reads as a malfunction.
//   2. A failure NEVER clears the box. Losing a setter's typed message is worse
//      than the send failing, and the failure is surfaced as a toast rather
//      than swallowed.
//   3. Email without a subject is a 400 from the endpoint
//      (functions/lib/messaging.ts:sendChannelMessage), so it is blocked here
//      rather than bouncing the setter off the network mid-call.
export default function Composer({ tenantId, contactId, contactName, lastMessageType }: Props) {
  const { showToast } = useToast();
  const send = useSetterSendMutation();

  const [channel, setChannel] = useState<SendChannel>(() => defaultChannelFor(lastMessageType));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const blockReason = sendBlockReason(channel, body, subject);
  const disabled = blockReason !== null || send.isPending;

  const submit = () => {
    if (blockReason !== null || send.isPending) return;
    send.mutate(
      {
        tenantId,
        contactId,
        channel,
        body: body.trim(),
        subject: channel === "Email" ? subject.trim() : undefined,
      },
      {
        onSuccess: (res) => {
          // Only a confirmed send clears the draft.
          setBody("");
          setSubject("");
          // The message went out either way, so this is never an error. But the
          // audit log is the ONLY record that a customer was messaged, and if
          // the row did not land the operator needs to know now rather than
          // discovering the gap later while trying to account for a send.
          if (res?.audited === false) {
            showToast(
              `Sent to ${contactName}, but it was NOT recorded in the audit log.`,
            );
            return;
          }
          showToast(`Sent to ${contactName}`);
        },
        onError: (err) => {
          const errBody =
            err && typeof err === "object" && "body" in err
              ? (err as { body?: { error?: string } }).body
              : null;
          showToast(sendErrorMessage(errBody?.error));
        },
      },
    );
  };

  return (
    <form
      className="border-t border-divider p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-semibold text-muted">Send as</span>
        <Segmented
          options={[...SEND_CHANNELS]}
          value={channel}
          onChange={(v) => {
            if (!send.isPending) setChannel(v);
          }}
          size="sm"
        />
        <span className="text-[11.5px] text-faint">
          Goes out under the client&apos;s name, not yours.
        </span>
      </div>

      {channel === "Email" && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={send.isPending}
          placeholder="Subject (required for email)"
          aria-label="Email subject"
          className="mt-2 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50 disabled:opacity-60"
        />
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={send.isPending}
        placeholder={`Message ${contactName}`}
        aria-label="Message body"
        className="mt-2 min-h-[76px] w-full resize-y rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50 disabled:opacity-60"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-warning">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          This sends immediately to the real customer. There is no undo.
        </p>
        <button
          type="submit"
          disabled={disabled}
          title={blockReason ?? undefined}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          {send.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Send size={14} aria-hidden />
          )}
          {send.isPending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
