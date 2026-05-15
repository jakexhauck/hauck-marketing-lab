import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import BrandedButton from "../components/BrandedButton";
import BrandedLogo from "../components/BrandedLogo";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { devMode } from "../lib/devMode";

export default function Login() {
  const [email, setEmail] = useState("");
  const { signIn } = useAuth();
  const { client } = useClient();
  const navigate = useNavigate();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    signIn(email);
    navigate("/dashboard");
  };

  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div
          className="w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.18)] dark:shadow-none"
        >
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

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="label-cap">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                required
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-base text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20"
              />
            </label>

            <BrandedButton type="submit" className="w-full">
              Send sign-in link
            </BrandedButton>
          </form>

          {devMode() && (
            <p className="mt-6 text-center text-xs text-[var(--text-faint)]">
              Demo mode. Any email signs you in.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
