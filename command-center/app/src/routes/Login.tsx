import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { APP_BRAND } from "../lib/appBrand";
import {
  MODERN_MOTION_VARS,
  MODERN_MOTION_GRADIENT,
  MODERN_MOTION_MESH,
} from "../lib/brandTheme";

type Phase = "idle" | "submitting" | "error";
type LoginMode = "live" | "test" | "admin";

const BRAND_HEADLINE = "Your Business Command Center";
const BRAND_TAGLINE = "Your clients, your pipeline, one command center.";

// One email + password form for everyone. Owners and team members sign in with
// their own email + password (staff-login); super-admins sign in to the admin
// console (admin-login). The account decides the tenant and role.
//
// "Modern Motion" look (repo-root design-kit.html): indigo/violet gradient brand
// panel on the left (lg+), a glass sign-in block on the right, light mesh wash on
// mobile. Tokens are overridden locally (MODERN_MOTION_VARS) so the rest of the
// app's theme is untouched. No Hauck wordmark/logo: the brand headline plus the
// "Secured by" credit carry the identity.
export default function Login() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("live");
  const { signInWithPassword, signInAsStaff, signInAsAdmin } = useAuth();
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
    // Test mode is a shared-password login into the internal staging sub-account
    // (no per-person account), so it takes only the password. Live and admin are
    // account-based and require an email too.
    if (!trimmedPw || (!isTest && !trimmedEmail)) return;
    setPhase("submitting");
    setErrorMsg(null);
    const res = isTest
      ? await signInWithPassword(trimmedPw, "test")
      : isAdmin
        ? await signInAsAdmin(trimmedEmail, trimmedPw)
        : await signInAsStaff(trimmedEmail, trimmedPw, "live");
    if (res.ok) {
      navigate(isAdmin ? "/admin/clients" : "/home", { replace: true });
    } else {
      setPhase("error");
      setErrorMsg(res.error ?? "Sign-in failed");
    }
  };

  // Live mode shows only the single sign-in line (no title). Test/admin keep
  // their functional heading + subtitle.
  const blockTitle = isAdmin
    ? "Admin Console"
    : isTest
      ? "Test Account"
      : "Sign in with your email and password";
  const blockSubtitle = isAdmin
    ? "Sign in to the admin console."
    : isTest
      ? "Preview changes on the staging sub-account."
      : null;

  const submitLabel =
    phase === "submitting"
      ? "Signing in..."
      : isTest
        ? "Enter test account"
        : "Sign in";

  const submitDisabled =
    phase === "submitting" || !password.trim() || (!isTest && !email.trim());

  const inputClass =
    "mt-2 w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[rgba(79,70,229,0.15)] disabled:opacity-60";

  const block = (
    <div className="fx-rise w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_18px_40px_rgba(40,42,70,0.12),0_6px_14px_rgba(40,42,70,0.07)]">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold leading-snug tracking-tight text-[var(--text)]">
          {blockTitle}
        </h1>
        {blockSubtitle && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{blockSubtitle}</p>
        )}
      </div>

      {isTest && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are signing into the internal test sub-account, not a client
          account.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        {/* Test mode is a shared-password login, so it shows no email field. */}
        {!isTest && (
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
              className={inputClass}
            />
          </label>
        )}
        <label className="block">
          <span className="label-cap">{isTest ? "Test password" : "Password"}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isTest ? "Enter test password" : "Enter password"}
            autoComplete="current-password"
            required
            disabled={phase === "submitting"}
            className={inputClass}
          />
        </label>

        {phase === "error" && errorMsg && (
          <p className="text-sm text-[var(--danger,#dc2626)]">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          style={{ backgroundImage: MODERN_MOTION_GRADIENT }}
          className="w-full rounded-[10px] py-3.5 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(79,70,229,0.28)] transition-[transform,box-shadow,filter] duration-200 hover:shadow-[0_12px_28px_rgba(79,70,229,0.38)] hover:brightness-[1.04] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-[0_8px_22px_rgba(79,70,229,0.28)] disabled:active:scale-100"
        >
          {submitLabel}
        </button>
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
    <div
      className="min-h-dvh bg-[var(--bg)] lg:grid lg:grid-cols-2"
      style={MODERN_MOTION_VARS}
    >
      {/* Brand panel: full-height indigo/violet gradient column at lg+. */}
      <aside
        className="hidden flex-col justify-between p-12 text-white lg:flex"
        style={{ backgroundImage: MODERN_MOTION_GRADIENT }}
      >
        <div />

        <div className="max-w-md">
          <h2 className="font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight">
            {BRAND_HEADLINE}
          </h2>
          <p className="mt-4 text-base font-medium text-white/70">
            {BRAND_TAGLINE}
          </p>
        </div>

        <div className="text-[11px] font-medium text-white/40">
          Secured by {APP_BRAND.securedBy}
        </div>
      </aside>

      {/* Sign-in column: light mesh wash below lg (with the headline on top),
          neutral surface at lg+ (the panel carries the color). */}
      <main
        className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-12 lg:bg-[var(--bg)]"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 48px)" }}
      >
        {/* Mobile-only mesh background. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{ backgroundColor: "#f6f7fb", backgroundImage: MODERN_MOTION_MESH }}
        />

        {/* Mobile-only brand headline above the block. */}
        <div className="relative z-10 mb-8 max-w-md text-center lg:hidden">
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--text)]">
            {BRAND_HEADLINE}
          </h2>
        </div>

        <div className="relative z-10 flex w-full flex-col items-center">
          {block}
          <div className="mt-6 text-center text-[11px] font-medium text-[var(--text-faint)] lg:hidden">
            Secured by {APP_BRAND.securedBy}
          </div>
        </div>
      </main>
    </div>
  );
}
