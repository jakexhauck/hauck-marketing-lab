import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui";

type Tab = "owner" | "staff";

export function Login() {
  const { signIn, signInStaff } = useAuth();
  const brand = useTenant();
  const [tab, setTab] = useState<Tab>("owner");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function describeError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return "Too many attempts. Wait a moment and try again.";
      return tab === "staff" ? "That email or password didn't match." : "That password didn't match.";
    }
    return "Couldn't reach the server. Check your connection.";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const mode = testMode ? "test" : "live";
    if (tab === "owner") {
      if (!password.trim()) return;
      setBusy(true);
      setError(null);
      try {
        await signIn(password, mode);
      } catch (err) {
        setError(describeError(err));
        setBusy(false);
      }
    } else {
      if (!email.trim() || !password.trim()) return;
      setBusy(true);
      setError(null);
      try {
        await signInStaff(email.trim(), password, mode);
      } catch (err) {
        setError(describeError(err));
        setBusy(false);
      }
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
    setPassword("");
  }

  const inputCls =
    "h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-[15px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

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
          {/* Owner / Staff segmented control */}
          <div className="mb-4 flex rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5 text-[13px] font-medium">
            <button
              type="button"
              onClick={() => switchTab("owner")}
              className={
                "flex-1 rounded-[calc(var(--radius-sm)-2px)] py-1.5 transition-colors " +
                (tab === "owner" ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text")
              }
            >
              Owner
            </button>
            <button
              type="button"
              onClick={() => switchTab("staff")}
              className={
                "flex-1 rounded-[calc(var(--radius-sm)-2px)] py-1.5 transition-colors " +
                (tab === "staff" ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text")
              }
            >
              Staff
            </button>
          </div>

          {tab === "staff" && (
            <label className="mb-3 block">
              <span className="label-cap mb-1.5 block">Email</span>
              <input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className={inputCls}
              />
            </label>
          )}

          <label className="block">
            <span className="label-cap mb-1.5 block">Password</span>
            <input
              type="password"
              autoFocus={tab === "owner"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={inputCls}
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
