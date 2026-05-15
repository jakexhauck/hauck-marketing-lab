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
          className="w-full rounded-3xl border border-slate-200 bg-white p-8"
          style={{ boxShadow: "0 24px 60px -30px rgba(15,23,42,0.18)" }}
        >
          <div className="flex flex-col items-center text-center">
            <BrandedLogo size="lg" />
            <span className="label-cap mt-6">Sign In</span>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
              {client.brand.appName}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
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
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20"
              />
            </label>

            <BrandedButton type="submit" className="w-full">
              Send sign-in link
            </BrandedButton>
          </form>

          {devMode() && (
            <p className="mt-6 text-center text-xs text-slate-400">
              Demo mode. Any email signs you in.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
