import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import type { Role, User } from "../types";
import { supabase, SUPABASE_CONFIGURED } from "../lib/supabase";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  session: Session | null;
  authUser: SupabaseUser | null;
  status: AuthStatus;
  isAdmin: boolean;
  adminChecked: boolean;
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  currentUser: User | null;
  setUser: (user: User | null) => void;
  signIn: (email: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const redirectTo = (): string =>
  typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : "/auth/callback";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    SUPABASE_CONFIGURED ? "loading" : "unauthenticated",
  );
  const [override, setOverride] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminChecked, setAdminChecked] = useState<boolean>(false);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      setStatus("unauthenticated");
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setStatus(data.session ? "authenticated" : "unauthenticated");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setStatus(sess ? "authenticated" : "unauthenticated");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      setAdminChecked(true);
      return;
    }
    const userId = session?.user?.id;
    if (!userId) {
      setIsAdmin(false);
      setAdminChecked(true);
      return;
    }
    setAdminChecked(false);
    let cancelled = false;
    supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setIsAdmin(Boolean(data));
        setAdminChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!SUPABASE_CONFIGURED) {
      return { ok: false, error: "Supabase not configured" };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    setOverride(null);
    if (SUPABASE_CONFIGURED) await supabase.auth.signOut();
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const signIn = useCallback((email: string) => {
    const synthetic: User = {
      id: "dev-user",
      clientId: "demo",
      name: email.split("@")[0] || "Dev",
      email,
      role: "owner",
    };
    setOverride(synthetic);
  }, []);

  const setUser = useCallback((user: User | null) => {
    setOverride(user);
  }, []);

  const currentUser = useMemo<User | null>(() => {
    if (override) return override;
    if (!session?.user) return null;
    const meta = session.user.user_metadata ?? {};
    const fullName =
      typeof meta.full_name === "string" ? meta.full_name : undefined;
    return {
      id: session.user.id,
      clientId: "",
      name: fullName || session.user.email || "User",
      email: session.user.email ?? "",
      role: "owner" as Role,
    };
  }, [override, session]);

  const value = useMemo(
    () => ({
      session,
      authUser: session?.user ?? null,
      status,
      isAdmin,
      adminChecked,
      signInWithEmail,
      signOut,
      currentUser,
      setUser,
      signIn,
    }),
    [
      session,
      status,
      isAdmin,
      adminChecked,
      signInWithEmail,
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
