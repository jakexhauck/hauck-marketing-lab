import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import BrandedButton from "../components/BrandedButton";
import { useAuth } from "../context/AuthContext";
import { APP_BRAND } from "../lib/appBrand";

type Phase = "idle" | "submitting" | "error";
type LoginMode = "live" | "test" | "admin";

// One email + password form for everyone. Owners and team members sign in with
// their own email + password (staff-login); super-admins sign in to the admin
// console (admin-login). The account decides the tenant and role. Responsive:
// a single centered card below lg, a two-column brand + form split at lg+.
export default function Login() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("live");
  const { signInAsStaff, signInAsAdmin } = useAuth();
  const navigate = useNavigate();

  const isTest = mode === "test";
  const isAdmin = mode === "admin";

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setPassword("");
    setPhase("idle");
    setErrorMsg(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedPw = password.trim();
    const trimmedEmail = email.trim();
    if (!trimmedPw || !trimmedEmail) return;
    setPhase("submitting");
    setErrorMsg(null);
    const res = isAdmin
      ? await signInAsAdmin(trimmedEmail, trimmedPw)
      : await signInAsStaff(trimmedEmail, trimmedPw, mode);
    if (res.ok) {
      navigate(isAdmin ? "/admin/clients" : "/home", { replace: true });
    } else {
      setPhase("error");
      setErrorMsg(res.error ?? "Sign-in failed");
    }
  };

  const heading = isAdmin
    ? "Admin Console"
    : isTest
      ? "Test Account"
      : APP_BRAND.appName;

  const subtitle = isAdmin
    ? "Sign in to the admin console."
    : isTest
      ? "Preview changes on the staging sub-account."
      : "Sign in with your email and password.";

  const submitLabel =
    phase === "submitting"
      ? "Signing in..."
      : isAdmin
        ? "Sign in"
        : isTest
          ? "Enter test account"
          : "Sign in";

  const submitDisabled =
    phase === "submitting" || !password.trim() || !email.trim();

  const card = (
    <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-lg)]">
      <div className="flex flex-col items-center text-center">
        <div
          className="shadow-brand flex h-12 w-12 items-center justify-center rounded-2xl font-display text-[15px] font-bold text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
          aria-hidden
        >
          {APP_BRAND.initials}
        </div>
        <span className="label-cap mt-6">{heading}</span>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--text)]">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>

      {isTest && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          You are signing into the internal test sub-account, not a client
          account.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="label-cap">Email</span>
          <input
            type="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@email.com"
            autoComplete="username"
            required
            disabled={phase === "submitting"}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-base text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="label-cap">
            {isTest ? "Test password" : "Password"}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isTest ? "Enter test password" : "Enter password"}
            autoComplete="current-password"
            required
            disabled={phase === "submitting"}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-base text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 disabled:opacity-60"
          />
        </label>

        {phase === "error" && errorMsg && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>
        )}

        <BrandedButton type="submit" className="w-full" disabled={submitDisabled}>
          {submitLabel}
        </BrandedButton>
      </form>

      <div className="mt-6 space-y-2 border-t border-[var(--border)] pt-4 text-center">
        {!isAdmin && (
          <button
            type="button"
            onClick={() => switchMode(isTest ? "live" : "test")}
            disabled={phase === "submitting"}
            className="block w-full text-sm text-[var(--text-muted)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:underline disabled:opacity-60"
          >
            {isTest ? "Back to client login" : "Log into test account"}
          </button>
        )}
        <button
          type="button"
          onClick={() => switchMode(isAdmin ? "live" : "admin")}
          disabled={phase === "submitting"}
          className="block w-full text-sm text-[var(--text-muted)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:underline disabled:opacity-60"
        >
          {isAdmin ? "Back to client login" : "Admin sign-in"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Brand panel: full-height indigo-to-violet gradient column at lg+. */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        {/* Soft light bloom over the gradient for depth. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(40rem 30rem at 0% 0%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(36rem 28rem at 100% 100%, rgba(0,0,0,0.18), transparent 60%)",
          }}
        />
        <img
          src="/hauck-wordmark.png"
          alt="Hauck Marketing"
          className="relative h-8 w-auto brightness-0 invert"
        />

        <div className="relative max-w-sm">
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            {APP_BRAND.appName}
          </h2>
          <p className="mt-3 text-base font-medium text-white/75">
            Your clients, your pipeline, one command center.
          </p>
        </div>

        <div className="relative text-[11px] font-medium text-white/50">
          Secured by {APP_BRAND.securedBy}
        </div>
      </aside>

      {/* Form column: the body's radial wash shows through (transparent). */}
      <main
        className="flex min-h-dvh flex-col items-center justify-center px-5 py-12"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 48px)" }}
      >
        {card}
        <div className="mt-6 text-center text-[11px] font-medium text-[var(--text-faint)] lg:hidden">
          Secured by {APP_BRAND.securedBy}
        </div>
      </main>
    </div>
  );
}
