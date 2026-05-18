import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Shell from "../components/Shell";
import BrandedButton from "../components/BrandedButton";
import BrandedLogo from "../components/BrandedLogo";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { SUPABASE_CONFIGURED } from "../lib/supabase";

type Phase = "idle" | "submitting" | "sent" | "error";

export default function Login() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { signInWithEmail } = useAuth();
  const { client } = useClient();

  useEffect(() => {
    const e = searchParams.get("error");
    if (e) {
      setPhase("error");
      setErrorMsg(decodeURIComponent(e));
      searchParams.delete("error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setPhase("submitting");
    setErrorMsg(null);
    const res = await signInWithEmail(trimmed);
    if (res.ok) {
      setPhase("sent");
    } else {
      setPhase("error");
      setErrorMsg(res.error ?? "Sign-in failed");
    }
  };

  const reset = () => {
    setPhase("idle");
    setErrorMsg(null);
  };

  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.18)] dark:shadow-none">
          <div className="flex flex-col items-center text-center">
            <BrandedLogo size="lg" />
            <span className="label-cap mt-6">Sign In</span>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--text)]">
              {client.brand.appName}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Your leads, your pipeline.
            </p>
          </div>

          {phase === "sent" ? (
            <div className="mt-8 space-y-4 text-center">
              <p className="text-base text-[var(--text)]">
                Check your inbox.
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                We sent a sign-in link to <span className="font-medium text-[var(--text)]">{email}</span>.
              </p>
              <button
                type="button"
                onClick={reset}
                className="text-sm text-[var(--brand)] underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <label className="block">
                <span className="label-cap">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
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
                disabled={phase === "submitting" || !email.trim()}
              >
                {phase === "submitting" ? "Sending..." : "Send sign-in link"}
              </BrandedButton>

              {!SUPABASE_CONFIGURED && (
                <p className="text-center text-xs text-[var(--text-faint)]">
                  Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
