import { useState } from "react";
import { LogOut, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useStartGoogleCalendarConnect } from "../../hooks/useApi";

// The blocking connect gate. A new client cannot reach any part of the app until
// they have linked their own Google Calendar, which is what keeps their real
// commitments out of the slots customers can book.
//
// Calendar-only since 2026-09-22. It used to walk Facebook and Instagram too,
// through GHL's Social Planner. Jake wants those under GHL Settings >
// Integrations, which no outside app can drive, so the agency connects them on
// the onboarding call and this screen asks only for what the client can do.
//
// It is an early return inside ProtectedRoute rather than a modal over the app,
// which is what makes "they cannot do anything else" structurally true: there is
// no app rendered behind this to reach. Same shape as SetupHoldingScreen.
//
// THE ONLY WAY PAST IS TO CONNECT, or for an admin to waive the gate on the
// client (0094 / 0101). The waivers exist because a hard gate has failure modes
// the client cannot fix from inside it.
export default function SocialConnectGate() {
  const { signOut } = useAuth();
  const start = useStartGoogleCalendarConnect();
  const [problem, setProblem] = useState("");

  // A full-page redirect, not a pop-up: Composio's consent round trip returns to
  // the app, where the gate re-answers on mount and lets them through.
  const connect = async () => {
    setProblem("");
    try {
      const res = await start.mutateAsync();
      if (res?.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
    } catch {
      // Falls through to the message below.
    }
    setProblem("We could not reach Google. Try again.");
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-[560px]">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-7 shadow-[var(--shadow-sm)] sm:p-9">
          <p className="label-cap text-center">Hauck Marketing</p>
          <h1 className="mt-2 text-center font-display text-[26px] leading-tight font-semibold text-text">
            Connect your Google Calendar.
          </h1>

          <button
            type="button"
            onClick={() => void connect()}
            disabled={start.isPending}
            className="mt-7 w-full rounded-[var(--radius)] bg-brand px-4 py-3 font-display text-[14px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {start.isPending ? "Opening Google..." : "Connect Google Calendar"}
          </button>

          {problem && (
            <p role="alert" className="mt-3 text-[13px] leading-relaxed text-danger">
              {problem}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <a
              href="mailto:jake@hauckmarketing.com"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-brand-text underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
            >
              <Mail size={15} aria-hidden />
              I need help with this
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
