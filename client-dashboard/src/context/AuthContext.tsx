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
  // True when authenticated but no identity has been chosen yet, so the app
  // can show the one-time "who are you?" picker. Always false while loading or
  // when an override is active (dev testing).
  needsIdentity: boolean;
  // Persist the chosen GHL user id (same value GHL puts in assignedTo) and
  // resolve the matching team member into currentUser. Pass "" to skip.
  setIdentity: (ghlUserId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const IDENTITY_KEY = "hml_identity";

function readStoredIdentity(): string | null {
  try {
    return localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }
}

interface ApiIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// Resolve a stored GHL user id to a real team member + role. Degrades to null
// (so currentUser falls back to the hardcoded owner) on any failure.
async function fetchIdentity(id: string): Promise<User | null> {
  if (!id) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/me/identity?id=${encodeURIComponent(id)}`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { identity?: ApiIdentity | null }
      | null;
    const it = body?.identity;
    if (!it) return null;
    return {
      id: it.id,
      clientId: "",
      name: it.name,
      email: it.email,
      role: it.role,
    };
  } catch {
    return null;
  }
}

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
  // The stored GHL user id chosen at the "who are you?" step, and the resolved
  // team member it maps to. identityResolved guards the picker from flashing
  // before the lookup completes.
  const [identityId, setIdentityId] = useState<string | null>(
    readStoredIdentity(),
  );
  const [identity, setIdentityUser] = useState<User | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);

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

  // Resolve the stored identity id into a real team member whenever it changes
  // and we are authenticated. Failures resolve to null so currentUser falls
  // back to the hardcoded owner.
  useEffect(() => {
    if (status !== "authenticated") {
      setIdentityUser(null);
      setIdentityResolved(false);
      return;
    }
    if (!identityId) {
      setIdentityUser(null);
      setIdentityResolved(true);
      return;
    }
    let mounted = true;
    setIdentityResolved(false);
    fetchIdentity(identityId).then((user) => {
      if (!mounted) return;
      setIdentityUser(user);
      setIdentityResolved(true);
    });
    return () => {
      mounted = false;
    };
  }, [status, identityId]);

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
    setIdentityUser(null);
    setIdentityResolved(false);
    setIdentityId(null);
    try {
      localStorage.removeItem(IDENTITY_KEY);
    } catch {
      // ignore
    }
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

  const setIdentity = useCallback((ghlUserId: string) => {
    const id = ghlUserId.trim();
    try {
      // Store even an empty choice ("skip") so the picker does not reappear.
      localStorage.setItem(IDENTITY_KEY, id);
    } catch {
      // ignore
    }
    if (!id) {
      // Skipped: no identity, fall back to the hardcoded owner default.
      setIdentityUser(null);
      setIdentityResolved(true);
      setIdentityId(null);
      return;
    }
    setIdentityId(id);
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

  // A choice has been made once an `hml_identity` entry exists (even an empty
  // "skip" entry). Used to decide whether to prompt the picker. identityId is
  // the live mirror of that key, but a skipped choice clears identityId while
  // leaving the (empty) key in place, so re-read storage too.
  const hasIdentityChoice = useMemo(
    () => identityId !== null || readStoredIdentity() !== null,
    [identityId],
  );

  const currentUser = useMemo<User | null>(() => {
    if (override) return override; // dev override, keep for testing
    if (status !== "authenticated") return null;
    // Real resolved identity from /api/me/identity when available.
    if (identity) return identity;
    // Fallback: hardcoded owner (Supabase/identity unavailable or skipped).
    return {
      id: "owner",
      clientId: "",
      name: "Owner",
      email: "",
      role: "owner" as Role,
    };
  }, [override, status, identity]);

  const needsIdentity = useMemo(
    () =>
      !override &&
      status === "authenticated" &&
      identityResolved &&
      !hasIdentityChoice,
    [override, status, identityResolved, hasIdentityChoice],
  );

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
      needsIdentity,
      setIdentity,
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
      needsIdentity,
      setIdentity,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
