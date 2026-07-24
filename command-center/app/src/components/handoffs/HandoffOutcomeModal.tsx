import { useState } from "react";
import {
  X,
  Phone,
  CalendarClock,
  Briefcase,
  Check,
  Clock3,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import Avatar from "../Avatar";
import { useNow } from "../../context/NowContext";
import { useUpdateHandoff } from "../../hooks/useApi";
import type { ApiHandoff } from "../../lib/api";
import {
  statusMeta,
  LOST_REASONS,
  minutesSince,
  shortDuration,
  isIgnored,
} from "../../lib/handoffModel";
import { TONE_CHIP } from "./tone";

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// A local datetime-local value ("YYYY-MM-DDTHH:mm") to an ISO instant.
function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Panel = null | "estimate" | "job" | "won" | "lost" | "later";

// Tap a lead, pick what happened. No chat (that lives on the owner's phone now).
// Each choice prompts for what it needs, then records the outcome. In the live
// app: Estimate/Job book a real appointment (Home Estimate / Job calendars) which
// moves the GHL stage + tags the lead; Won writes the value to the opportunity;
// Lost writes the reason as a note; Follow Up adds a task. All tagged owner-*.
export default function HandoffOutcomeModal({
  handoff,
  onClose,
  onBook,
}: {
  handoff: ApiHandoff;
  onClose: () => void;
  // Estimate / Job send the owner to the Schedule tab to pick a real slot. When
  // absent (standalone, no calendar beside it) the inline date/time is used.
  onBook?: (kind: "estimate" | "job") => void;
}) {
  const now = useNow();
  const update = useUpdateHandoff();
  const [panel, setPanel] = useState<Panel>(null);
  const [value, setValue] = useState(handoff.value ? String(handoff.value) : "");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");

  const commit = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, { onSuccess: onClose });

  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  const meta = statusMeta(handoff.status);
  const ignored = isIgnored(handoff, now);
  const settled = handoff.status === "won" || handoff.status === "lost";
  const chipLabel =
    (handoff.status === "won" || handoff.status === "job_booked") && handoff.value
      ? `${meta.label} · $${handoff.value.toLocaleString()}`
      : meta.label;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-[var(--radius-xl,20px)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <Avatar name={handoff.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[17px] font-bold text-[var(--text)]">
              {handoff.name}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
              Qualified by {handoff.setterName} · {handoff.phone}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status + how long it's been sitting + call */}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <span className={"rounded-full px-2.5 py-1 text-[12px] font-semibold " + TONE_CHIP[meta.tone]}>
            {chipLabel}
          </span>
          {ignored ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-600 dark:text-rose-400">
              <AlertCircle size={13} strokeWidth={2.5} />
              Not started yet
            </span>
          ) : (
            <span className="text-[12px] text-[var(--text-muted)]">
              Handed off {shortDuration(minutesSince(handoff.handedAt, now))} ago
            </span>
          )}
          <a
            href={telHref(handoff.phone)}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 text-[13px] font-bold text-white hover:bg-emerald-600"
          >
            <Phone size={14} strokeWidth={2.5} />
            Call
          </a>
        </div>

        {/* Outcome choices */}
        <div className="border-t border-[var(--divider)] px-3 py-2.5">
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            {settled ? "Recorded outcome" : "What happened?"}
          </div>

          {settled ? (
            <button
              type="button"
              onClick={() => commit({ id: handoff.id, status: "new" })}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
            >
              <RotateCcw size={16} />
              Reopen this lead
            </button>
          ) : (
            <>
              <OutcomeRow
                label="Estimate booked"
                hint="Book the in-home estimate"
                Icon={CalendarClock}
                tint="text-violet-600 dark:text-violet-300"
                active={handoff.status === "estimate_set"}
                disabled={update.isPending}
                onClick={() => (onBook ? onBook("estimate") : toggle("estimate"))}
              />
              {panel === "estimate" && (
                <ApptPanel
                  calendar="Home Estimate"
                  when={when}
                  setWhen={setWhen}
                  onConfirm={() => commit({ id: handoff.id, status: "estimate_set", estimateAt: toIso(when) ?? undefined })}
                />
              )}

              <OutcomeRow
                label="Job booked"
                hint="Schedule the install"
                Icon={Briefcase}
                tint="text-[var(--brand-text)]"
                active={handoff.status === "job_booked"}
                disabled={update.isPending}
                onClick={() => (onBook ? onBook("job") : toggle("job"))}
              />
              {panel === "job" && (
                <ApptPanel
                  calendar="Job"
                  when={when}
                  setWhen={setWhen}
                  onConfirm={() => commit({ id: handoff.id, status: "job_booked", jobAt: toIso(when) ?? undefined })}
                />
              )}

              <OutcomeRow
                label="Won"
                hint="Job closed, record the amount"
                Icon={Check}
                tint="text-emerald-600 dark:text-emerald-400"
                active={handoff.status === "won"}
                disabled={update.isPending}
                onClick={() => toggle("won")}
              />
              {panel === "won" && (
                <div className="mb-1 ml-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-500/5">
                  <span className="text-[13px] font-semibold text-[var(--text)]">Job value</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-faint)]">
                      $
                    </span>
                    <input
                      autoFocus
                      type="number"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="8,400"
                      className="h-8 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-5 pr-2 text-[13px] text-[var(--text)] outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => commit({ id: handoff.id, status: "won", value: value ? Number(value) : null })}
                    className="ml-auto inline-flex h-8 items-center rounded-full bg-emerald-500 px-4 text-[13px] font-bold text-white hover:bg-emerald-600"
                  >
                    Mark won
                  </button>
                </div>
              )}

              <OutcomeRow
                label="Lost"
                hint="Didn't close"
                Icon={X}
                tint="text-[var(--text-muted)]"
                active={handoff.status === "lost"}
                disabled={update.isPending}
                onClick={() => toggle("lost")}
              />
              {panel === "lost" && (
                <div className="mb-1 ml-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                  <span className="text-[13px] font-semibold text-[var(--text)]">Why?</span>
                  {LOST_REASONS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => commit({ id: handoff.id, status: "lost", lostReason: r.key })}
                      className="inline-flex h-7 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--text)]"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

              <OutcomeRow
                label="Follow up later"
                hint="Set a reminder task"
                Icon={Clock3}
                tint="text-amber-600 dark:text-amber-400"
                active={handoff.status === "later"}
                disabled={update.isPending}
                onClick={() => toggle("later")}
              />
              {panel === "later" && (
                <div className="mb-1 ml-3 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-50/60 px-3 py-2.5 dark:bg-amber-500/5">
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">
                    When
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text)] outline-none focus:border-amber-500"
                    />
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note, e.g. call about financing"
                    className="resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-amber-500"
                  />
                  <button
                    type="button"
                    disabled={!when}
                    onClick={() =>
                      commit({
                        id: handoff.id,
                        status: "later",
                        followUpAt: toIso(when) ?? undefined,
                        followUpNote: note.trim() || null,
                      })
                    }
                    className="self-end inline-flex h-8 items-center rounded-full bg-amber-500 px-4 text-[13px] font-bold text-white hover:bg-amber-600 disabled:opacity-40"
                  >
                    Add follow-up
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OutcomeRow({
  label,
  hint,
  Icon,
  tint,
  active,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  Icon: typeof Check;
  tint: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 " +
        (active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]")
      }
    >
      <Icon size={18} strokeWidth={2.2} className={tint} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14.5px] font-bold text-[var(--text)]">{label}</span>
        <span className="block text-[12px] text-[var(--text-muted)]">{hint}</span>
      </span>
      {active && <Check size={16} className="text-[var(--brand-text)]" />}
    </button>
  );
}

function ApptPanel({
  calendar,
  when,
  setWhen,
  onConfirm,
}: {
  calendar: string;
  when: string;
  setWhen: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mb-1 ml-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-tint)] px-3 py-2">
      <span className="text-[13px] font-semibold text-[var(--text)]">
        Book on <span className="text-[var(--brand-text)]">{calendar}</span>
      </span>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--brand-primary)]"
      />
      <button
        type="button"
        disabled={!when}
        onClick={onConfirm}
        className="ml-auto inline-flex h-8 items-center rounded-full px-4 text-[13px] font-bold text-white disabled:opacity-40"
        style={{ backgroundColor: "var(--brand-primary)" }}
      >
        Book
      </button>
    </div>
  );
}
