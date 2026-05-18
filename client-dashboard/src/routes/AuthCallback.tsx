import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import { supabase, SUPABASE_CONFIGURED } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      navigate("/login?error=not-configured", { replace: true });
      return;
    }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const errParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");

    if (errParam) {
      setError(errParam);
      const t = setTimeout(() => navigate(`/login?error=${encodeURIComponent(errParam)}`, { replace: true }), 1200);
      return () => clearTimeout(t);
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: exErr }) => {
        if (exErr) {
          setError(exErr.message);
          setTimeout(() => navigate(`/login?error=${encodeURIComponent(exErr.message)}`, { replace: true }), 1200);
        } else {
          navigate("/dashboard", { replace: true });
        }
      });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard", { replace: true });
      else navigate("/login?error=missing-code", { replace: true });
    });
  }, [navigate]);

  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]" aria-hidden="true" />
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {error ? `Sign-in failed: ${error}` : "Signing you in..."}
          </p>
        </div>
      </div>
    </Shell>
  );
}
