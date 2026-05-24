import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Role, User } from "../types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
export type SessionMode = "live" | "test";

interface AuthContextValue {
  status: AuthStatus;
  session: { authenticated: true } | null;
  mode: SessionMode;
  isAdmin: boolean;
  adminChecked: boolean;
  signInWithPassword: (
    password: string,
    mode?: SessionMode,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  currentUser: User | null;
  setUser: (user: User | null) => void;
  signIn: (email: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function checkSession(): Promise<{ ok: boolean; mode: SessionMode }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
    });
    if (!res.ok) return { ok: false, mode: "live" };
    const body = (await res.json().catch(() => null)) as
      | { mode?: SessionMode }
      | null;
    return { ok: true, mode: body?.mode === "test" ? "test" : "live" };
  } catch {
    return { ok: false, mode: "live" };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [mode, setMode] = useState<SessionMode>("live");
  const [override, setOverride] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;
    checkSession().then(({ ok, mode }) => {
      if (!mounted) return;
      setStatus(ok ? "authenticated" : "unauthenticated");
      setMode(mode);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const signInWithPassword = useCallback(
    async (password: string, mode: SessionMode = "live") => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password, mode }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          return {
            ok: false,
            error: body?.error ?? `Sign-in failed (${res.status})`,
          };
        }
        setStatus("authenticated");
        setMode(mode);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setOverride(null);
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setStatus("unauthenticated");
    setMode("live");
  }, []);

  const setUser = useCallback((user: User | null) => {
    setOverride(user);
  }, []);

  const signIn = useCallback((email: string) => {
    setOverride({
      id: "dev-user",
      clientId: "demo",
      name: email.split("@")[0] || "Dev",
      email,
      role: "owner" as Role,
    });
  }, []);

  const currentUser = useMemo<User | null>(() => {
    if (override) return override;
    if (status !== "authenticated") return null;
    return {
      id: "owner",
      clientId: "",
      name: "Owner",
      email: "",
      role: "owner" as Role,
    };
  }, [override, status]);

  const session = useMemo<{ authenticated: true } | null>(
    () => (status === "authenticated" ? { authenticated: true } : null),
    [status],
  );

  const value = useMemo(
    () => ({
      status,
      session,
      mode,
      isAdmin: false,
      adminChecked: true,
      signInWithPassword,
      signOut,
      currentUser,
      setUser,
      signIn,
    }),
    [
      status,
      session,
      mode,
      signInWithPassword,
      signOut,
      currentUser,
      setUser,
      signIn,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
