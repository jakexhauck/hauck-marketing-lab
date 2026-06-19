import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui";

type Tab = "owner" | "staff" | "admin";

export function Login() {
  const { signIn, signInStaff, signInAdmin } = useAuth();
  const brand = useTenant();
  const [tab, setTab] = useState<Tab>("owner");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = tab === "admin";

  function describeError(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return "Too many attempts. Wait a moment and try again.";
      return tab === "owner" ? "That password didn't match." : "That email or password didn't match.";
    }
    return "Couldn't reach the server. Check your connection.";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const mode = testMode ? "test" : "live";
    try {
      if (tab === "owner") {
        if (!password.trim()) return;
        setBusy(true);
        setError(null);
        await signIn(password, mode);
      } else if (tab === "staff") {
        if (!email.trim() || !password.trim()) return;
        setBusy(true);
        setError(null);
        await signInStaff(email.trim(), password, mode);
      } else {
        if (!email.trim() || !password.trim()) return;
        setBusy(true);
        setError(null);
        await signInAdmin(email.trim(), password);
      }
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
    setPassword("");
    if (next !== "staff" && next !== "admin") setEmail("");
    if (next === "admin") setTestMode(false);
  }

  const inputCls =
    "h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-[15px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

  return (
    <div className="desk-grid flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[380px]">
        {/* Brand lockup */}
        <div className="mb-7 flex flex-col items-center text-center">
          <span
            className={
              "mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] text-lg font-bold shadow-[var(--shadow-md)] " +
              (isAdmin ? "bg-text text-bg" : "text-brand-fg")
            }
            style={isAdmin ? undefined : { background: "var(--brand)" }}
          >
            {isAdmin ? <ShieldCheck size={24} /> : brand.initials}
          </span>
          <h1 className="font-display text-2xl text-text">
            {isAdmin ? "Command Center" : brand.appName}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isAdmin ? "Agency admin access" : "Operations cockpit"}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-md)]"
        >
          {/* Owner / Staff segmented control (hidden in admin mode) */}
          {!isAdmin && (
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
          )}

          {(tab === "staff" || isAdmin) && (
            <label className="mb-3 block">
              <span className="label-cap mb-1.5 block">Email</span>
              <input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isAdmin ? "you@hauckmarketing.com" : "you@business.com"}
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
                {isAdmin ? "Enter Command Center" : "Sign in"} <ArrowRight size={16} />
              </>
            )}
            {busy && "Signing in"}
          </Button>

          {!isAdmin && (
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
          )}
        </form>

        {/* Admin access is deliberately understated: a quiet link, not a tab. */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => switchTab("owner")}
              className="transition-colors hover:text-muted"
            >
              ← Back to client sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchTab("admin")}
              className="flex items-center gap-1.5 transition-colors hover:text-muted"
            >
              <ShieldCheck size={13} /> Admin access
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
