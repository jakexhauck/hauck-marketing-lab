import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import BrandedButton from "../components/BrandedButton";
import BrandedLogo from "../components/BrandedLogo";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";

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
      <div className="flex flex-1 items-center justify-center px-5">
        <div className="w-full rounded-3xl bg-white p-7 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <BrandedLogo size="lg" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
              {client.brand.appName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Your leads, your pipeline.</p>
          </div>

          <form onSubmit={onSubmit} className="mt-7 space-y-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                required
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
              />
            </label>

            <BrandedButton type="submit" className="w-full">
              Send sign-in link
            </BrandedButton>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            Demo mode. Any email signs you in.
          </p>
        </div>
      </div>
    </Shell>
  );
}
