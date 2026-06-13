import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, UNAUTHORIZED_EVENT } from "@/lib/api";
import type { ApiLoginResponse, ApiMe, SessionMode } from "@hauck/core";

type Status = "loading" | "authenticated" | "unauthenticated";
const MODE_KEY = "hml_crm_mode";

interface AuthCtx {
  status: Status;
  mode: SessionMode | null;
  signIn: (password: string, mode: SessionMode) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<SessionMode | null>(null);

  const becomeUnauthenticated = useCallback(() => {
    setStatus("unauthenticated");
    setMode(null);
    localStorage.removeItem(MODE_KEY);
    qc.clear();
  }, [qc]);

  // Probe the session on mount and whenever the network returns.
  const reconcile = useCallback(async () => {
    try {
      const me = await api<ApiMe>("/api/auth/me");
      if (me.ok) {
        setMode(me.mode);
        localStorage.setItem(MODE_KEY, me.mode);
        setStatus("authenticated");
      } else {
        becomeUnauthenticated();
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        becomeUnauthenticated();
      } else {
        // Network blip: don't bounce a logged-in user to /login on a flaky call.
        setStatus((s) => (s === "loading" ? "unauthenticated" : s));
      }
    }
  }, [becomeUnauthenticated]);

  useEffect(() => {
    void reconcile();
    const onUnauthorized = () => becomeUnauthenticated();
    const onOnline = () => void reconcile();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
      window.removeEventListener("online", onOnline);
    };
  }, [reconcile, becomeUnauthenticated]);

  const signIn = useCallback(
    async (password: string, signinMode: SessionMode) => {
      const res = await api<ApiLoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password, mode: signinMode }),
      });
      if (!res.ok) throw new ApiError(401, "incorrect password", res);
      qc.clear();
      setMode(res.mode);
      localStorage.setItem(MODE_KEY, res.mode);
      setStatus("authenticated");
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Logging out locally matters even if the network call fails.
    }
    becomeUnauthenticated();
  }, [becomeUnauthenticated]);

  const value = useMemo(
    () => ({ status, mode, signIn, signOut }),
    [status, mode, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
