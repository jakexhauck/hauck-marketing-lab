import { Ban, PhoneOff, ThumbsDown, UserX } from "lucide-react";
import type { ColdCallDialOutcome, LiveDialerCall } from "../../../lib/api";
import { formatTime } from "../../../lib/format";
import { formatPhoneDashed } from "../../../lib/phone";

// The calls GoHighLevel's power dialer has made that nobody has judged yet.
//
// The dialer moves faster than a person can press a button, so without this the
// outcome somebody records lands on whichever prospect happens to be on screen,
// which by then is the wrong one. This panel is the fix: every call the phone
// system reports appears here as a row, oldest at the bottom, and the outcome is
// pressed against the CALL rather than against the selection.
//
// Silent when there is nothing waiting. A caller working the queue by hand never
// sees it at all, which is the right amount of interface for a feature that only
// exists while a dialer is running.
//
// Clicking the business opens it in the queue below, where the full set of
// buttons lives (a callback needs a date and a booking needs a calendar, and
// neither belongs in a row). The four terminal outcomes are here, because those
// are the ones that need pressing before the dialer has moved on twice more.

interface Props {
  calls: LiveDialerCall[];
  // Lead ids currently in the queue on the left, so a prospect who is not in
  // this stage can say where they are instead of pretending to be selectable.
  queueIds: Set<string>;
  selectedLeadId: string | null;
  onPick: (leadId: string) => void;
  onOutcome: (call: LiveDialerCall, outcome: ColdCallDialOutcome) => void;
}

function title(call: LiveDialerCall): string {
  return (
    call.businessName ||
    call.name ||
    formatPhoneDashed(call.phone) ||
    "Unknown business"
  );
}

// m:ss, or what GoHighLevel says instead when there is no duration yet. A null
// is not a zero: it is an unanswered call, or an answered one GoHighLevel has
// not finished writing up.
function callLabel(call: LiveDialerCall): string {
  if (typeof call.durationSeconds === "number") {
    const m = Math.floor(call.durationSeconds / 60);
    const s = call.durationSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const status = (call.callStatus ?? "").replace(/[-_]/g, " ").trim();
  return status || "no duration yet";
}

export default function PowerDialerPanel({
  calls,
  queueIds,
  selectedLeadId,
  onPick,
  onOutcome,
}: Props) {
  if (calls.length === 0) return null;

  return (
    <div className="pk-card overflow-hidden rounded-[var(--radius-lg)] border border-border">
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <span className="font-display text-[14px] font-semibold">Waiting on an outcome</span>
        <span className="font-mono text-[12px] text-muted">{calls.length}</span>
      </div>
      {/* Capped and scrolled rather than allowed to grow. A long session leaves
          a dozen calls here, and a list that pushes the call card off the bottom
          of the screen would cost more than it saves: the card is where a
          callback and a booking are recorded. */}
      <ul className="max-h-[38dvh] overflow-y-auto">
        {calls.map((call) => {
          const inQueue = Boolean(call.leadId && queueIds.has(call.leadId));
          const on = Boolean(call.leadId && call.leadId === selectedLeadId);
          return (
            <li
              key={call.dialId}
              className={[
                "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider px-4 py-3 last:border-b-0",
                on ? "bg-surface-2" : "",
              ].join(" ")}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: call.live ? "var(--brand)" : "var(--text-faint)" }}
                title={call.live ? "On the phone now" : "Call has ended"}
                aria-hidden
              />
              <button
                type="button"
                disabled={!inQueue}
                onClick={() => call.leadId && onPick(call.leadId)}
                title={
                  inQueue
                    ? "Open this prospect in the queue below"
                    : call.status
                      ? `This prospect is in ${call.status}`
                      : "Not in this list"
                }
                className={[
                  "min-w-0 flex-1 text-left",
                  inQueue ? "hover:text-brand" : "cursor-default",
                ].join(" ")}
              >
                <span className="block truncate text-[13.5px] font-medium">{title(call)}</span>
                <span className="block truncate font-mono text-[12px] text-muted">
                  {formatTime(call.startedAt)} · {callLabel(call)}
                  {!inQueue && call.status ? ` · ${call.status}` : ""}
                </span>
              </button>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <QuickOutcome
                  icon={PhoneOff}
                  label="No answer"
                  onClick={() => onOutcome(call, "no_answer")}
                />
                <QuickOutcome
                  icon={UserX}
                  label="Not qualified"
                  onClick={() => onOutcome(call, "not_qualified")}
                />
                <QuickOutcome
                  icon={Ban}
                  label="Heard opener, said no"
                  onClick={() => onOutcome(call, "opener_no")}
                />
                <QuickOutcome
                  icon={ThumbsDown}
                  label="Heard pitch, said no"
                  onClick={() => onOutcome(call, "pitch_no")}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Icon only, with the label as its accessible name and its tooltip. A row per
// call with four worded buttons on it would be wider than the screen, and these
// four are the same four, in the same order, on every row: the shape is what is
// being read, not the words.
function QuickOutcome({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof PhoneOff;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-brand hover:text-brand"
    >
      <Icon size={14} aria-hidden />
    </button>
  );
}
