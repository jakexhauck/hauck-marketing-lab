import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2, Phone, Send, X } from "lucide-react";
import {
  ApiError,
  callColdSmsProspect,
  getColdSmsProspect,
  getColdSmsThread,
  sendColdSmsText,
  type ColdSmsCard,
  type ColdSmsThread,
  type ColdSmsPipelineRef,
} from "../../../lib/api";
import { stillPending, type PendingText } from "../../../lib/coldSmsChat";
import { VerdictBadge } from "./VerdictBadge";
import SmsBookingWizard from "./SmsBookingWizard";

// The card's side panel: who they are, the variation they were sent, the whole
// text thread with a reply box, a move-to menu for any pipeline, and the booking
// wizard behind "Book call".
//
// Chat speed (Jake, 2026-10-13): a sent text shows the instant Send is hit and
// the box is free for the next one; the thread is refreshed on its own (one GHL
// call) right after each send and every 10 seconds while the panel is open.

const THREAD_POLL_MS = 10_000;

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function SmsProspectPanel({
  card,
  pipelines,
  boardPipelineId,
  onMove,
  onClose,
  onToast,
}: {
  card: ColdSmsCard;
  pipelines: ColdSmsPipelineRef[];
  boardPipelineId: string;
  onMove: (pipelineId: string, stageId: string, label: string) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const key = ["admin", "cold-sms", "prospect", card.contactId];
  const threadKey = [...key, "thread"];
  // The full read also seeds the thread, so opening the panel is one request.
  const prospect = useQuery({
    queryKey: key,
    queryFn: async () => {
      const d = await getColdSmsProspect(card.contactId);
      qc.setQueryData<ColdSmsThread>(threadKey, {
        conversationId: d.conversationId,
        messages: d.messages,
        threadFailed: d.threadFailed,
      });
      return d;
    },
    enabled: Boolean(card.contactId),
  });
  const conversationId = useRef<string | null>(null);
  const thread = useQuery({
    queryKey: threadKey,
    // A failed refresh throws so the last good thread stays on screen.
    queryFn: async () => {
      const t = await getColdSmsThread(card.contactId, conversationId.current);
      if (t.threadFailed) throw new Error("thread_failed");
      return t;
    },
    retry: false,
    enabled: Boolean(prospect.data),
    staleTime: 5_000,
    refetchInterval: THREAD_POLL_MS,
  });
  conversationId.current = thread.data?.conversationId ?? prospect.data?.conversationId ?? null;

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingText[]>([]);
  const [booking, setBooking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const nextTemp = useRef(0);

  const call = useMutation({
    mutationFn: () => callColdSmsProspect(card.contactId),
    onSuccess: (res) => onToast(res.ok ? "Calling your phone" : (res.message ?? "GoHighLevel did not place the call")),
    onError: () => onToast("GoHighLevel did not place the call"),
  });

  const patch = (tempId: string, change: Partial<PendingText>) =>
    setPending((list) => list.map((p) => (p.tempId === tempId ? { ...p, ...change } : p)));

  // Never retried on its own: a resent text is a second text on a stranger's
  // phone. A failed one waits for Jake to tap Retry.
  const sendText = (body: string, tempId = `t${++nextTemp.current}`) => {
    setPending((list) => [
      ...list.filter((p) => p.tempId !== tempId),
      { tempId, body, at: new Date().toISOString(), status: "sending" },
    ]);
    sendColdSmsText(card.contactId, body).then(
      (res) => {
        patch(tempId, { status: "sent", messageId: res.messageId });
        void qc.invalidateQueries({ queryKey: threadKey, exact: true });
      },
      (e) => {
        patch(tempId, { status: "failed" });
        onToast(e instanceof ApiError && e.status === 409 ? "They opted out of texts" : "Text did not send");
      },
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !booking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, booking]);

  // The reply box grows with the text (Jake, 2026-10-13), up to half the
  // screen, then scrolls. Back to two lines once sent.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.5)}px`;
  }, [draft]);

  const messages = (thread.data?.messages ?? prospect.data?.messages ?? []).filter(
    (m) => m.body || m.attachments?.length,
  );
  const shownPending = stillPending(pending, messages);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, shownPending.length]);

  const c = prospect.data?.contact;
  const variation = c?.variation ?? card.variation;
  const firstOutIdx = messages.findIndex((m) => m.direction === "outbound");
  const verdict = prospect.data?.verdict ?? card.verdict;
  const currentValue = `${boardPipelineId}|${card.stageId}`;
  const place = [c?.city, c?.state].filter(Boolean).join(", ");

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={card.business}
        className="fixed bottom-0 right-0 top-0 z-[61] flex w-[min(480px,100vw)] flex-col border-l border-[var(--border)] bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold leading-snug text-text">{card.business}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {[c ? `${c.firstName} ${c.lastName}`.trim() : card.person, c?.phone || card.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => call.mutate()}
            disabled={call.isPending || !(c?.phone || card.phone)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-surface-2 px-3.5 py-2 text-[13px] font-bold text-text disabled:opacity-50"
          >
            {call.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Phone size={15} aria-hidden />}
            Call
          </button>
          <button
            type="button"
            onClick={() => setBooking(true)}
            disabled={!prospect.data}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-[var(--brand-fg,#fff)] disabled:opacity-50"
          >
            <CalendarPlus size={15} aria-hidden />
            Book call
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <div className="border-b border-[var(--border)] px-5 py-3">
          <select
            aria-label="Move to"
            value={currentValue}
            onChange={(e) => {
              const [p, s] = e.target.value.split("|");
              const pipe = pipelines.find((x) => x.id === p);
              const stage = pipe?.stages.find((x) => x.id === s);
              if (pipe && stage) onMove(p, s, pipe.id === boardPipelineId ? stage.name : `${pipe.name} › ${stage.name}`);
            }}
            className="w-full rounded-xl border border-[var(--border)] bg-surface-2 px-3 py-2 text-[13px] font-semibold text-text"
          >
            {pipelines.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.stages.map((s) => (
                  <option key={s.id} value={`${p.id}|${s.id}`}>
                    {p.name} › {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-b border-[var(--border)] px-5 py-3 text-[13px]">
          {place && <Fact label="City" value={place} />}
          {c?.service && <Fact label="Service" value={c.service} />}
          {variation && <Fact label="Variation" value={variation} />}
          {card.firstContactedAt && (
            <Fact label="First contacted" value={fmt.format(new Date(card.firstContactedAt))} />
          )}
          {c?.email && <Fact label="Email" value={c.email} />}
          {c?.website && <Fact label="Website" value={c.website} />}
          <dt className="text-faint">Reply</dt>
          <dd className="m-0">{verdict ? <VerdictBadge verdict={verdict} /> : <span className="text-faint">None</span>}</dd>
        </dl>

        <div ref={threadRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-[var(--bg)] px-5 py-4">
          {prospect.isLoading && <p className="m-auto text-[13px] text-faint">Loading...</p>}
          {(thread.data ?? prospect.data)?.threadFailed && messages.length === 0 && (
            <p className="m-auto text-[13px] text-faint">The thread did not load.</p>
          )}
          {messages.map((m, i) => {
            const out = m.direction === "outbound";
            return (
              <div key={m.id} className={`flex max-w-[84%] flex-col ${out ? "self-end items-end" : "self-start items-start"}`}>
                {i === firstOutIdx && variation && (
                  <span className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-faint">{variation}</span>
                )}
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${
                    out
                      ? "rounded-br-md bg-[var(--brand)] text-[var(--brand-fg,#fff)]"
                      : "rounded-bl-md border border-[var(--border)] bg-surface text-text"
                  }`}
                >
                  {m.body}
                  {m.attachments?.map((a) => (
                    <a key={a} href={a} target="_blank" rel="noreferrer" className="mt-1 block underline">
                      Attachment
                    </a>
                  ))}
                </div>
                <span className="mt-0.5 text-[10.5px] text-faint">{m.at ? fmt.format(new Date(m.at)) : ""}</span>
              </div>
            );
          })}
          {shownPending.map((p) => (
            <div key={p.tempId} className="flex max-w-[84%] flex-col items-end self-end">
              <div
                className={`whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--brand)] px-3 py-2 text-[13.5px] leading-snug text-[var(--brand-fg,#fff)] ${
                  p.status === "sending" ? "opacity-70" : ""
                } ${p.status === "failed" ? "opacity-50" : ""}`}
              >
                {p.body}
              </div>
              {p.status === "failed" ? (
                <span className="mt-0.5 flex gap-2 text-[10.5px] font-semibold">
                  <span className="text-[var(--danger)]">Not sent</span>
                  <button type="button" onClick={() => sendText(p.body, p.tempId)} className="text-text underline">
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending((list) => list.filter((x) => x.tempId !== p.tempId))}
                    className="text-muted underline"
                  >
                    Remove
                  </button>
                </span>
              ) : (
                <span className="mt-0.5 text-[10.5px] text-faint">
                  {p.status === "sending" ? "Sending" : fmt.format(new Date(p.at))}
                </span>
              )}
            </div>
          ))}
        </div>

        <form
          className="flex items-end gap-2 border-t border-[var(--border)] px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            setDraft("");
            sendText(t);
          }}
        >
          <textarea
            ref={boxRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder={`Text ${c?.firstName || card.business}`}
            aria-label="Message"
            className="max-h-[50vh] flex-1 resize-none overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] leading-snug text-text outline-none focus:border-[var(--brand)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="grid h-[54px] w-12 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-[var(--brand-fg,#fff)] disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      </aside>

      {booking && prospect.data && (
        <SmsBookingWizard
          prospect={prospect.data}
          card={card}
          onClose={() => setBooking(false)}
          onBooked={(label) => {
            setBooking(false);
            onToast(`Booked ${label}`);
            void qc.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </>,
    document.body,
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="m-0 min-w-0 break-words font-medium text-text">{value}</dd>
    </>
  );
}
