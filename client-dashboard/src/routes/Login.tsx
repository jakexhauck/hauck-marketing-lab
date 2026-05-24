import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import BrandedButton from "../components/BrandedButton";
import BrandedLogo from "../components/BrandedLogo";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";

type Phase = "idle" | "submitting" | "error";
type LoginMode = "live" | "test";

export default function Login() {
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("live");
  const { signInWithPassword } = useAuth();
  const { client } = useClient();
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
    const trimmed = password.trim();
    if (!trimmed) return;
    setPhase("submitting");
    setErrorMsg(null);
    const res = await signInWithPassword(trimmed, mode);
    if (res.ok) {
      navigate("/dashboard", { replace: true });
    } else {
      setPhase("error");
      setErrorMsg(res.error ?? "Sign-in failed");
    }
  };

  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.18)] dark:shadow-none">
          <div className="flex flex-col items-center text-center">
            <BrandedLogo size="lg" />
            <span className="label-cap mt-6">
              {isTest ? "Test Account" : "Sign In"}
            </span>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text)]">
              {isTest ? "Test Account" : client.brand.appName}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {isTest
                ? "Preview changes on the staging sub-account."
                : "Your leads, your pipeline."}
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
              disabled={phase === "submitting" || !password.trim()}
            >
              {phase === "submitting"
                ? "Signing in..."
                : isTest
                  ? "Enter test account"
                  : "Send sign-in link"}
            </BrandedButton>
          </form>

          <div className="mt-6 border-t border-[var(--border)] pt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode(isTest ? "live" : "test")}
              disabled={phase === "submitting"}
              className="text-sm font-medium text-[var(--text-muted)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:underline disabled:opacity-60"
            >
              {isTest ? "Back to client login" : "Log into test account"}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
