import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../ui/Button";

// The post-booking confirmation. Shown the moment an appointment is booked: a
// green check animates in, the booked date/time is called out, and the setter
// is reminded to add the lead to a groupchat with the company owner. Closing is
// gated: the X asks "has the lead been added?" first, so the reminder cannot be
// dismissed by reflex. This is a reminder + gate only; there is no groupchat
// integration behind it.

interface Props {
  whenIso: string;
  onExit: () => void;
}

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "your appointment";
  return `${dayFmt.format(d)} at ${timeFmt.format(d)}`;
}

export default function BookedConfirmation({ whenIso, onExit }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(15,18,48,0.5)] p-5">
      {/* Scoped animation for the check-in. Unique names so nothing global
          collides. */}
      <style>{`
        @keyframes hmBookedPop { 0% { transform: scale(0); opacity: 0 } 55% { transform: scale(1.12) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes hmBookedDraw { to { stroke-dashoffset: 0 } }
        .hm-booked-badge { animation: hmBookedPop .45s cubic-bezier(.2,.8,.2,1) both }
        .hm-booked-mark {
          fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 26; stroke-dashoffset: 26;
          animation: hmBookedDraw .4s .28s ease-out forwards;
        }
      `}</style>

      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-lg)]">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <X size={16} />
        </button>

        <div className="hm-booked-badge mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-positive/15">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-positive shadow-[0_8px_24px_-6px_rgba(34,197,94,0.6)]">
            <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden>
              <path className="hm-booked-mark" d="M5 12.5 l4.5 4.5 L19 7" />
            </svg>
          </div>
        </div>

        <h2 className="font-display text-[20px] font-bold tracking-tight text-text">
          Appointment Booked for {formatWhen(whenIso)}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[320px] text-[14px] font-medium text-muted">
          Now Add This Lead To A Groupchat With The Company Owner!
        </p>

        {confirming && (
          <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-4">
            <p className="text-[14px] font-semibold text-text">
              Has the lead been added to the groupchat?
            </p>
            <div className="mt-3 flex justify-center gap-2.5">
              <Button variant="secondary" size="md" onClick={() => setConfirming(false)}>
                No
              </Button>
              <Button variant="primary" size="md" onClick={onExit}>
                Yes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
