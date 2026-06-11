import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  enablePush,
  hasPushSubscription,
  isInstalledPwa,
  pushAlreadyGranted,
} from "../lib/push";

const DISMISS_KEY = "hml_notif_dismissed_until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    // session-only dismissal is fine
  }
}

// An "Enable notifications" prompt shown only when the app runs as an
// installed PWA (matchMedia display-mode: standalone). Covers two states:
// permission never granted (first ask), and permission granted but no live
// subscription (e.g. after sign-out unsubscribed the device), which offers
// re-enabling. "Not now" sticks for 7 days.
export default function NotificationPrompt() {
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "working" | "denied" | "unsupported" | "failed"
  >("idle");
  // null = still checking; checking only matters when permission is granted.
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  const granted = pushAlreadyGranted();

  useEffect(() => {
    if (!isInstalledPwa() || !granted) return;
    let mounted = true;
    hasPushSubscription().then((has) => {
      if (mounted) setSubscribed(has);
    });
    return () => {
      mounted = false;
    };
  }, [granted]);

  if (hidden || !isInstalledPwa() || dismissedRecently()) return null;
  // Permission granted: hide while the subscription check is pending or when
  // a live subscription already exists; otherwise offer re-enabling.
  if (granted && subscribed !== false) return null;

  const reEnable = granted && subscribed === false;

  const onEnable = async () => {
    setStatus("working");
    const result = await enablePush();
    if (result === "granted") {
      setSubscribed(true);
      setHidden(true);
      return;
    }
    setStatus(result);
  };

  const onDismiss = () => {
    rememberDismissal();
    setHidden(true);
  };

  const subtitle =
    status === "denied"
      ? "Notifications are blocked. Enable them in your device settings."
      : status === "unsupported"
        ? "This device does not support notifications."
        : status === "failed"
          ? "Could not enable notifications. Check your connection and try again."
          : reEnable
            ? "Notifications were turned off on this device. Tap to turn them back on."
            : "Get a buzz the moment a lead texts back or a new lead arrives.";

  return (
    <div className="mx-[22px] mt-5 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white">
          <Bell size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-[var(--text)]">
            {reEnable ? "Notifications are off" : "Turn on notifications"}
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
          {status === "working"
            ? "Enabling..."
            : reEnable
              ? "Re-enable"
              : "Enable"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)] transition-transform active:scale-[0.98]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
