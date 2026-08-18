import type { DialTally } from "../../../lib/api";

// The day's dials, counted while the day is being worked.
//
// Every call is already a row: the outcome buttons write one, and the live poll
// writes one for anything GoHighLevel's power dialer placed. Until now nothing
// showed that back during a session, so "how many have we done" meant leaving
// the page you are calling from and reading the tracker.
//
// It rides the same 8.5s poll that records the calls, so the number moves on its
// own while a dialer works and costs nothing extra to keep true.
//
// Pending calls are in it. The phone system reported them, so they happened;
// what they became is the question the panel below this one asks.

interface Props {
  tally: DialTally;
  // Whoever is on this page, so their own line reads as theirs.
  callerId?: string;
}

export default function DialCounter({ tally, callerId = "" }: Props) {
  return (
    <div className="pk-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-lg)] border border-border px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[14px] font-semibold">Dials today</span>
        <span className="font-mono text-[20px] font-semibold leading-none tabular-nums">
          {tally.total}
        </span>
      </div>

      {/* Named only when there is more than one person on the phones. One
          caller's breakdown is the total again, said twice. */}
      {tally.callers.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {tally.callers.map((caller) => (
            <span key={caller.callerId} className="flex items-baseline gap-2">
              <span
                className={[
                  "text-[13px]",
                  caller.callerId === callerId ? "font-medium" : "text-muted",
                ].join(" ")}
              >
                {caller.name}
              </span>
              <span className="font-mono text-[13px] tabular-nums text-muted">{caller.dials}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
