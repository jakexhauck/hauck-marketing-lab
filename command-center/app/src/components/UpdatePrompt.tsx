import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

// How often a long-lived session re-checks for a new build. Without this, a
// client who never closes the app would only see the banner on next reopen.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * "Update available" banner. With registerType: "prompt", a freshly deployed
 * build installs and waits; this surfaces it as a tap-to-apply banner so the
 * client controls when the app reloads (instead of a silent mid-session swap).
 *
 * Tapping Update calls updateServiceWorker(true), which posts SKIP_WAITING to
 * the waiting worker (handled in sw.ts) and reloads the page once it takes over.
 */
export default function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Poll for a new build on a timer so open sessions still get prompted.
      // update() is a no-op/throws offline, so guard on connectivity.
      setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9999] px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-[420px] items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-[var(--brand-fg)]">
          <RefreshCw size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-[var(--text)]">
            New version available
          </div>
          <div className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">
            Tap to update to the latest version.
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[var(--brand-fg)] transition-transform active:scale-[0.98]"
          >
            Update
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex items-center justify-center rounded-xl px-4 py-1 text-[12px] font-semibold text-[var(--text-muted)]"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
