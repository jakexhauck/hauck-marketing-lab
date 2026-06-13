import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui";

export function Login() {
  const { signIn } = useAuth();
  const brand = useTenant();
  const [password, setPassword] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(password, testMode ? "test" : "live");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 429
            ? "Too many attempts. Wait a moment and try again."
            : "That password didn't match."
          : "Couldn't reach the server. Check your connection.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="desk-grid flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[380px]">
        {/* Brand lockup */}
        <div className="mb-7 flex flex-col items-center text-center">
          <span
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] text-lg font-bold text-brand-fg shadow-[var(--shadow-md)]"
            style={{ background: "var(--brand)" }}
          >
            {brand.initials}
          </span>
          <h1 className="font-display text-2xl text-text">{brand.appName}</h1>
          <p className="mt-1 text-sm text-muted">Operations cockpit</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-md)]"
        >
          <label className="block">
            <span className="label-cap mb-1.5 block">Password</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-[15px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-[var(--radius-sm)] bg-danger-tint px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-4 w-full">
            {!busy && (
              <>
                Sign in <ArrowRight size={16} />
              </>
            )}
            {busy && "Signing in"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setTestMode((v) => !v);
              setError(null);
            }}
            className="mt-3 w-full text-center text-[12.5px] text-faint transition-colors hover:text-muted"
          >
            {testMode ? "← Back to live account" : "Log into test account instead"}
          </button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          <ShieldCheck size={13} /> Secured by Hauck Marketing
        </p>
      </div>
    </div>
  );
}
