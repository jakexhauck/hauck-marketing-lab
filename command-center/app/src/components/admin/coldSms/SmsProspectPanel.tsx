import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2, Send, X } from "lucide-react";
import {
  ApiError,
  getColdSmsProspect,
  sendColdSmsText,
  type ColdSmsCard,
  type ColdSmsPipelineRef,
} from "../../../lib/api";
import { VerdictBadge } from "./VerdictBadge";
import SmsBookingWizard from "./SmsBookingWizard";

// The card's side panel: who they are, the variation they were sent, the whole
// text thread with a reply box, a move-to menu for any pipeline, and the booking
// wizard behind "Book call".

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
  const prospect = useQuery({
    queryKey: key,
    queryFn: () => getColdSmsProspect(card.contactId),
    enabled: Boolean(card.contactId),
    refetchInterval: 20_000,
  });
  const [draft, setDraft] = useState("");
  const [booking, setBooking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (text: string) => sendColdSmsText(card.contactId, text),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) =>
      onToast(e instanceof ApiError && e.status === 409 ? "They opted out of texts" : "Text did not send"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !booking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, booking]);

  const messages = (prospect.data?.messages ?? []).filter((m) => m.body || m.attachments?.length);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

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
          {prospect.data?.threadFailed && <p className="m-auto text-[13px] text-faint">The thread did not load.</p>}
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
        </div>

        <form
          className="flex gap-2 border-t border-[var(--border)] px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (t && !send.isPending) send.mutate(t);
          }}
        >
          <textarea
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
            className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] text-text outline-none focus:border-[var(--brand)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            aria-label="Send"
            className="grid w-12 place-items-center rounded-xl bg-[var(--brand)] text-[var(--brand-fg,#fff)] disabled:opacity-40"
          >
            {send.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
