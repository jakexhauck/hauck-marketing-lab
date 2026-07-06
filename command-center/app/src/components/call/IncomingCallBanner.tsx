import { useState } from "react";
import { Phone, X } from "lucide-react";
import { useIncomingCall } from "../../hooks/useIncomingCall";
import { formatPhone } from "../../lib/phone";
import CallConsole from "./CallConsole";

// Self-mounted, self-contained: renders nothing until the notifications feed
// carries a fresh call_inbound entry. Sits above the app shell (and below the
// Call Console + its SlotPickerModal) so it shows on every route the moment a
// call rings in, whether the console is open or not.
export default function IncomingCallBanner() {
  const { call, dismiss } = useIncomingCall();
  const [open, setOpen] = useState(false);

  if (!call) return null;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[60] flex items-center gap-3 border-b border-brand/30 bg-brand px-4 py-2.5 text-brand-fg shadow-[var(--shadow-brand)]">
        <Phone size={16} className="shrink-0 animate-pulse" aria-hidden />
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">
          Incoming call
          <span className="mx-1.5 opacity-70">·</span>
          {formatPhone(call.phone) || call.phone}
          <span className="mx-1.5 opacity-70">·</span>
          {call.name || "Unknown caller"}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-[8px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-brand-fg hover:bg-white/25"
        >
          Open call console
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss incoming call"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-brand-fg/80 hover:bg-white/15 hover:text-brand-fg"
        >
          <X size={15} />
        </button>
      </div>

      {open && (
        <CallConsole
          key={call.key}
          call={call}
          onClose={() => {
            setOpen(false);
            dismiss();
          }}
        />
      )}
    </>
  );
}
