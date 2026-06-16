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
import type {
  ApiLoginResponse,
  ApiMe,
  ApiStaffIdentity,
  ApiStaffLoginResponse,
  Capability,
  Action,
  EffectivePermissions,
  SessionMode,
} from "@hauck/core";

type Status = "loading" | "authenticated" | "unauthenticated";
const MODE_KEY = "hml_crm_mode";

interface AuthCtx {
  status: Status;
  mode: SessionMode | null;
  // True for the shared-password owner OR a staff member with role 'owner'.
  // Owners see every surface and edit control.
  isOwner: boolean;
  staff: ApiStaffIdentity | null;
  // can(capability, action): is the signed-in user allowed this? Owners always
  // true. Mirrors the backend's authoritative check so the UI never offers an
  // action the server would reject.
  can: (capability: Capability, action?: Action) => boolean;
  signIn: (password: string, mode: SessionMode) => Promise<void>;
  signInStaff: (email: string, password: string, mode: SessionMode) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [staff, setStaff] = useState<ApiStaffIdentity | null>(null);
  const [permissions, setPermissions] = useState<EffectivePermissions>({});

  const becomeUnauthenticated = useCallback(() => {
    setStatus("unauthenticated");
    setMode(null);
    setIsOwner(false);
    setStaff(null);
    setPermissions({});
    localStorage.removeItem(MODE_KEY);
    qc.clear();
  }, [qc]);

  const applyMe = useCallback((me: ApiMe) => {
    setMode(me.mode);
    setIsOwner(me.isOwner ?? true);
    setStaff(me.staff ?? null);
    setPermissions(me.permissions ?? {});
    localStorage.setItem(MODE_KEY, me.mode);
    setStatus("authenticated");
  }, []);

  // Probe the session on mount and whenever the network returns.
  const reconcile = useCallback(async () => {
    try {
      const me = await api<ApiMe>("/api/auth/me");
      if (me.ok) applyMe(me);
      else becomeUnauthenticated();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        becomeUnauthenticated();
      } else {
        // Network blip: don't bounce a logged-in user to /login on a flaky call.
        setStatus((s) => (s === "loading" ? "unauthenticated" : s));
      }
    }
  }, [applyMe, becomeUnauthenticated]);

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
      // Owner shared-password login: full access, no staff identity.
      setMode(res.mode);
      setIsOwner(true);
      setStaff(null);
      setPermissions({});
      localStorage.setItem(MODE_KEY, res.mode);
      setStatus("authenticated");
    },
    [qc],
  );

  const signInStaff = useCallback(
    async (email: string, password: string, signinMode: SessionMode) => {
      const res = await api<ApiStaffLoginResponse>("/api/auth/staff-login", {
        method: "POST",
        body: JSON.stringify({ email, password, mode: signinMode }),
      });
      if (!res.ok) throw new ApiError(401, "incorrect email or password", res);
      qc.clear();
      // The cookie is set; fetch the full identity + permissions via /me so we
      // get the effective grant map (staff-login returns only a summary).
      await reconcile();
    },
    [qc, reconcile],
  );

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Logging out locally matters even if the network call fails.
    }
    becomeUnauthenticated();
  }, [becomeUnauthenticated]);

  const can = useCallback(
    (capability: Capability, action: Action = "view") => {
      if (isOwner) return true;
      const p = permissions[capability];
      if (!p) return false;
      return action === "view" ? p.view || p.edit : p.edit;
    },
    [isOwner, permissions],
  );

  const value = useMemo(
    () => ({ status, mode, isOwner, staff, can, signIn, signInStaff, signOut }),
    [status, mode, isOwner, staff, can, signIn, signInStaff, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
