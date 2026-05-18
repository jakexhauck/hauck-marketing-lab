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

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URL(window.location.href).searchParams;
    const errParam =
      hashParams.get("error_description") ??
      hashParams.get("error") ??
      queryParams.get("error_description") ??
      queryParams.get("error");

    if (errParam) {
      setError(errParam);
      const t = setTimeout(() => navigate(`/login?error=${encodeURIComponent(errParam)}`, { replace: true }), 1200);
      return () => clearTimeout(t);
    }

    let settled = false;
    const goAuthed = () => {
      if (settled) return;
      settled = true;
      navigate("/dashboard", { replace: true });
    };
    const goUnauthed = () => {
      if (settled) return;
      settled = true;
      navigate("/login?error=sign-in-link-expired", { replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (sess && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        goAuthed();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goAuthed();
    });

    const fallback = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) goAuthed();
        else goUnauthed();
      });
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(fallback);
    };
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
