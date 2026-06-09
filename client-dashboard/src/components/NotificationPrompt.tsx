import { useState } from "react";
import { Bell } from "lucide-react";
import {
  enablePush,
  isInstalledPwa,
  pushAlreadyGranted,
} from "../lib/push";

// A one-time "Enable notifications" prompt shown only when the app runs as an
// installed PWA (matchMedia display-mode: standalone) and permission has not
// already been granted. Outside that window it renders nothing.
export default function NotificationPrompt() {
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "working" | "denied" | "unsupported"
  >("idle");

  // Gate: installed PWA, permission not yet granted, not dismissed this session.
  if (hidden || !isInstalledPwa() || pushAlreadyGranted()) return null;

  const onEnable = async () => {
    setStatus("working");
    try {
      const result = await enablePush();
      if (result === "granted") {
        setHidden(true);
        return;
      }
      setStatus(result);
    } catch {
      setStatus("denied");
    }
  };

  const subtitle =
    status === "denied"
      ? "Notifications are blocked. Enable them in your device settings."
      : status === "unsupported"
        ? "This device does not support notifications."
        : "Get a buzz the moment a lead texts back or a new lead arrives.";

  return (
    <div className="mx-[22px] mt-5 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white">
          <Bell size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-[var(--text)]">
            Turn on notifications
          </div>
          <div className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onEnable}
          disabled={status === "working" || status === "unsupported"}
          className="inline-flex flex-1 items-center justify-center rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "working" ? "Enabling..." : "Enable"}
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)] transition-transform active:scale-[0.98]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
