import { useEffect, useState } from "react";
import { LogOut, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

// What a client sees while their GoHighLevel sub-account does not exist yet.
//
// They chose this password themselves at the end of the intake form, so signing
// in the same afternoon is the natural thing to try. The app behind this screen
// is real but empty: no GHL sub-account, no leads, no calendar. Showing it would
// teach them their new software is broken.
//
// So this is deliberately not an error page and carries no apology. It is a
// progress note in the same voice as the form they just filled in: we have your
// answers, we are building, here is what happens next.
//
// It answers to the sub-account being wired, NOT to an admin pressing a button
// (Jake, 2026-08-15). Nobody has to remember to release a client: the screen
// clears itself the moment their GoHighLevel is real, and the next thing they
// see is SocialConnectGate asking for Facebook and Instagram.
//
// The API is enforcing this independently (every tenant surface answers 503
// while the client's creds are placeholders), so this screen cannot be skipped
// by editing state in the browser. It is the polite face of a real gate.

const STEPS = [
  "Your account is created",
  "We are connecting your phone number, calendar and ad account",
  "Then you connect your Facebook and Instagram, and your app opens",
];

export default function SetupHoldingScreen() {
  const { signOut } = useAuth();
  const [name, setName] = useState<string>("");

  // The tenant endpoint carries branding and is not behind the gate, so the
  // client sees their own business name rather than a generic banner.
  useEffect(() => {
    let alive = true;
    fetch("/api/tenant", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive && body && typeof body.name === "string") setName(body.name);
      })
      .catch(() => {
        // A name is a nicety. Without it the screen still says everything that
        // matters, so a failed fetch is not worth an error state.
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-[520px]">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-7 shadow-[var(--shadow-sm)] sm:p-9">
          <p className="label-cap">Hauck Marketing</p>
          <h1 className="mt-2 font-display text-[26px] leading-tight font-semibold text-text">
            We are setting up{name ? ` ${name}` : " your account"}.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            Thanks for sending your answers over. Your login works, but there is nothing worth
            showing you in here yet. We will email you the moment it is ready.
          </p>

          <ol className="mt-7 flex flex-col gap-3.5">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${
                    i === 0
                      ? "bg-positive/15 text-positive"
                      : "border border-border text-faint"
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className={`text-[14px] leading-snug ${i === 0 ? "text-text" : "text-muted"}`}>
                  {step}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <a
              href="mailto:jake@hauckmarketing.com"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-brand-text underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
            >
              <Mail size={15} aria-hidden />
              Ask us anything
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
