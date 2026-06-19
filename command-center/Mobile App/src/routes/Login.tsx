import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import BrandedButton from "../components/BrandedButton";
import BrandedLogo from "../components/BrandedLogo";
import { useAuth } from "../context/AuthContext";
import { APP_BRAND } from "../lib/appBrand";

type Phase = "idle" | "submitting" | "error";
type LoginMode = "live" | "test";

// One email + password form for everyone. Owner and team members alike sign in
// with their own email + password (POST /api/auth/staff-login); the account
// decides the tenant and role. The old shared-password owner login is retired.
export default function Login() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("live");
  const { signInAsStaff } = useAuth();
  const navigate = useNavigate();

  const isTest = mode === "test";

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
    const res = await signInAsStaff(trimmedEmail, trimmedPw, mode);
    if (res.ok) {
      navigate("/home", { replace: true });
    } else {
      setPhase("error");
      setErrorMsg(res.error ?? "Sign-in failed");
    }
  };

  return (
    <Shell>
      <div
        className="flex flex-1 flex-col items-center justify-center px-5 py-12"
        style={{
          background: "linear-gradient(165deg, #13294a 0%, #0d1f38 100%)",
          paddingTop: "calc(env(safe-area-inset-top) + 48px)",
        }}
      >
        <div className="w-full rounded-3xl bg-white p-8 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col items-center text-center">
            <BrandedLogo size="lg" />
            <span className="label-cap mt-6">
              {isTest ? "Test Account" : "Sign In"}
            </span>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text)]">
              {isTest ? "Test Account" : APP_BRAND.appName}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {isTest
                ? "Preview changes on the staging sub-account."
                : "Sign in with your email and password."}
            </p>
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
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errorMsg}
              </p>
            )}

            <BrandedButton
              type="submit"
              className="w-full"
              disabled={
                phase === "submitting" || !password.trim() || !email.trim()
              }
            >
              {phase === "submitting"
                ? "Signing in..."
                : isTest
                  ? "Enter test account"
                  : "Sign in"}
            </BrandedButton>
          </form>

          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode(isTest ? "live" : "test")}
              disabled={phase === "submitting"}
              className="block w-full text-sm font-medium text-[var(--text-muted)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:underline disabled:opacity-60"
            >
              {isTest ? "Back to client login" : "Log into test account"}
            </button>
          </div>
        </div>
        <div className="mt-6 text-center text-[11px] font-medium text-white/40">
          Secured by {APP_BRAND.securedBy}
        </div>
      </div>
    </Shell>
  );
}
