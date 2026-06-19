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
import type { Capability } from "../lib/capabilities";
import { clearAllCaches } from "../lib/queryClient";
import { clearAppBadge, disablePush } from "../lib/push";

// "authenticated-offline": the session probe failed at the network layer (not
// a 401/403) while a previous session is plausible. The app stays usable on
// cached data instead of bouncing to /login; an `online` event re-verifies.
type AuthStatus =
  | "loading"
  | "authenticated"
  | "authenticated-offline"
  | "unauthenticated";
export type SessionMode = "live" | "test";

// A staff member's effective permissions per capability, as /api/auth/me
// reports them. Owners report an empty map and isOwner=true (full access).
export type EffectivePermissions = Record<string, { view: boolean; edit: boolean }>;

interface StaffIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// A signed-in super-admin (admin_accounts). Global, not tenant-scoped.
interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  status: AuthStatus;
  session: { authenticated: true } | null;
  mode: SessionMode;
  // True for a signed-in super-admin (admin_accounts), gating the /admin area.
  isAdmin: boolean;
  // The signed-in admin's identity, or null when the session is not an admin.
  admin: AdminIdentity | null;
  adminChecked: boolean;
  // True for owner (shared-password) sessions, false for staff sessions. Gates
  // owner-only UI like the Team screen. Defaults true while a session loads.
  isOwner: boolean;
  // The signed-in staff member, or null for an owner session.
  staff: StaffIdentity | null;
  // Effective per-surface permissions for a staff session; empty for owners.
  permissions: EffectivePermissions;
  // Permission gate used by the nav + edit controls. Owners pass everything;
  // staff need a matching grant. Mirrors the backend enforcement, which stays
  // authoritative. Defaults to the "view" action.
  can: (capability: Capability, action?: "view" | "edit") => boolean;
  signInWithPassword: (
    password: string,
    mode?: SessionMode,
  ) => Promise<{ ok: boolean; error?: string }>;
  // Email + password login for staff accounts (POST /api/auth/staff-login).
  signInAsStaff: (
    email: string,
    password: string,
    mode?: SessionMode,
  ) => Promise<{ ok: boolean; error?: string }>;
  // Email + password login for super-admins (POST /api/auth/admin-login).
  signInAsAdmin: (
    email: string,
    password: string,
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
// Non-sensitive breadcrumb (just "live" | "test") proving a session existed on
// this device. Lets an offline launch stay signed in on cached data instead of
// reading the failed session probe as "logged out". Written on every
// successful login/probe, cleared on sign-out and on a genuine 401.
const LAST_MODE_KEY = "hml_last_session_mode";

function readStoredIdentity(): string | null {
  try {
    return localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }
}

function readLastSessionMode(): SessionMode | null {
  try {
    const v = localStorage.getItem(LAST_MODE_KEY);
    return v === "live" || v === "test" ? v : null;
  } catch {
    return null;
  }
}

function writeLastSessionMode(mode: SessionMode | null): void {
  try {
    if (mode) localStorage.setItem(LAST_MODE_KEY, mode);
    else localStorage.removeItem(LAST_MODE_KEY);
  } catch {
    // storage unavailable; offline relaunch will just require a network probe
  }
}

interface ApiIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// transient = the lookup failed for reasons that say nothing about the
// identity itself (network down, 5xx). A clean "not found" is not transient.
interface IdentityResult {
  user: User | null;
  transient: boolean;
}

// Resolve a stored GHL user id to a real team member + role.
async function fetchIdentity(id: string): Promise<IdentityResult> {
  if (!id) return { user: null, transient: false };
  try {
    const res = await fetch(
      `${API_BASE}/api/me/identity?id=${encodeURIComponent(id)}`,
      { credentials: "include" },
    );
    if (!res.ok) return { user: null, transient: res.status >= 500 };
    const body = (await res.json().catch(() => null)) as
      | { identity?: ApiIdentity | null }
      | null;
    const it = body?.identity;
    if (!it) return { user: null, transient: false };
    return {
      user: {
        id: it.id,
        clientId: "",
        name: it.name,
        email: it.email,
        role: it.role,
      },
      transient: false,
    };
  } catch {
    return { user: null, transient: true };
  }
}

interface SessionProbe {
  ok: boolean;
  mode: SessionMode;
  // True when the probe never got an HTTP answer (offline / server down).
  // A 401/403 response is NOT offline: that is a real "no session".
  offline: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  admin: AdminIdentity | null;
  staff: StaffIdentity | null;
  permissions: EffectivePermissions;
}

interface ApiMe {
  mode?: SessionMode;
  isOwner?: boolean;
  isAdmin?: boolean;
  admin?: AdminIdentity | null;
  staff?: StaffIdentity | null;
  permissions?: EffectivePermissions;
}

const EMPTY_PROBE = (offline: boolean): SessionProbe => ({
  ok: false,
  mode: "live",
  offline,
  isOwner: true,
  isAdmin: false,
  admin: null,
  staff: null,
  permissions: {},
});

async function checkSession(): Promise<SessionProbe> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
    });
    if (!res.ok) return EMPTY_PROBE(false);
    const body = (await res.json().catch(() => null)) as ApiMe | null;
    return {
      ok: true,
      mode: body?.mode === "test" ? "test" : "live",
      offline: false,
      // Absent isOwner means an owner (shared-password) session: full access.
      isOwner: body?.isOwner !== false,
      isAdmin: body?.isAdmin === true,
      admin: body?.admin ?? null,
      staff: body?.staff ?? null,
      permissions: body?.permissions ?? {},
    };
  } catch {
    return EMPTY_PROBE(true);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [mode, setMode] = useState<SessionMode>("live");
  const [override, setOverride] = useState<User | null>(null);
  // Owner vs staff session, resolved from /api/auth/me. Owner is the default so
  // the single-operator (shared-password) case never gets gated by accident.
  const [isOwner, setIsOwner] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [permissions, setPermissions] = useState<EffectivePermissions>({});
  // The stored GHL user id chosen at the "who are you?" step, and the resolved
  // team member it maps to. identityResolved guards the picker from flashing
  // before the lookup completes.
  const [identityId, setIdentityId] = useState<string | null>(
    readStoredIdentity(),
  );
  const [identity, setIdentityUser] = useState<User | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);
  // True when a stored identity could not be resolved for transient reasons
  // (network/5xx) even after a retry. Drives the rep-fallback in currentUser.
  const [identityFailed, setIdentityFailed] = useState(false);

  const isAuthed = status === "authenticated" || status === "authenticated-offline";

  // Probe the session. Runs at mount and again on every `online` event so an
  // offline-grace session gets verified (or genuinely signed out) the moment
  // connectivity returns.
  const reconcileSession = useCallback(async () => {
    const probe = await checkSession();
    if (probe.ok) {
      writeLastSessionMode(probe.mode);
      setMode(probe.mode);
      setIsOwner(probe.isOwner);
      setIsAdmin(probe.isAdmin);
      setAdmin(probe.admin);
      setStaff(probe.staff);
      setPermissions(probe.permissions);
      setStatus("authenticated");
      return;
    }
    if (probe.offline) {
      const last = readLastSessionMode();
      if (last) {
        setMode(last);
        setStatus("authenticated-offline");
        return;
      }
      setStatus("unauthenticated");
      return;
    }
    // The server answered and said no: clear the breadcrumb.
    writeLastSessionMode(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    void reconcileSession();
    const onOnline = () => void reconcileSession();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reconcileSession]);

  // Central 401 handling: api() dispatches this event when any call comes back
  // unauthorized mid-session. Caches are cleared so the next login (possibly
  // the other mode) starts from nothing, and ProtectedRoute redirects to
  // /login once currentUser goes null.
  useEffect(() => {
    const onUnauthorized = () => {
      writeLastSessionMode(null);
      // The session is already dead, so the server-side unsubscribe inside
      // disablePush will 401; the LOCAL unsubscribe still succeeds and that
      // alone stops deliveries to this device. Best-effort either way.
      void disablePush();
      clearAppBadge();
      void clearAllCaches();
      setIsOwner(true);
      setIsAdmin(false);
      setAdmin(null);
      setStaff(null);
      setPermissions({});
      setStatus("unauthenticated");
      setMode("live");
    };
    window.addEventListener("hml:unauthorized", onUnauthorized);
    return () => window.removeEventListener("hml:unauthorized", onUnauthorized);
  }, []);

  // Resolve the stored identity id into a real team member whenever it changes
  // and we are authenticated (including offline-grace). A transient failure is
  // retried once; if it still fails, identityFailed makes currentUser degrade
  // to a minimal rep rather than silently promoting to the owner UI.
  useEffect(() => {
    if (!isAuthed) {
      setIdentityUser(null);
      setIdentityResolved(false);
      setIdentityFailed(false);
      return;
    }
    if (!identityId) {
      setIdentityUser(null);
      setIdentityResolved(true);
      setIdentityFailed(false);
      return;
    }
    let mounted = true;
    setIdentityResolved(false);
    (async () => {
      let result = await fetchIdentity(identityId);
      if (result.transient && mounted) {
        result = await fetchIdentity(identityId);
      }
      if (!mounted) return;
      setIdentityUser(result.user);
      setIdentityFailed(!result.user && result.transient);
      setIdentityResolved(true);
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthed, identityId]);

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
        // Anything cached belongs to whatever session came before (possibly
        // the other mode); a fresh session must start from zero.
        await clearAllCaches();
        writeLastSessionMode(mode);
        // Shared-password login is always the owner: full access, no staff.
        setIsOwner(true);
        setStaff(null);
        setPermissions({});
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

  const signInAsStaff = useCallback(
    async (email: string, password: string, mode: SessionMode = "live") => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/staff-login`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, mode }),
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
        await clearAllCaches();
        writeLastSessionMode(mode);
        setMode(mode);
        // Pull the staff identity + effective permissions from /api/auth/me so
        // the UI gates correctly. The cookie is already set by staff-login.
        await reconcileSession();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
    [reconcileSession],
  );

  const signInAsAdmin = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
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
        await clearAllCaches();
        // Admin sessions are always "live"; the cookie is set by admin-login.
        writeLastSessionMode("live");
        setMode("live");
        await reconcileSession();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
    [reconcileSession],
  );

  const signOut = useCallback(async () => {
    // While the session cookie still works: stop push delivery to this device
    // (a logged-out phone must not keep receiving lead PII). Best-effort.
    await disablePush();
    clearAppBadge();
    setOverride(null);
    setIdentityUser(null);
    setIdentityResolved(false);
    setIdentityFailed(false);
    setIdentityId(null);
    writeLastSessionMode(null);
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
    // Memory, persisted snapshot, and SW caches all go: the next session
    // (possibly the other mode) must not see this one's data.
    await clearAllCaches();
    setIsOwner(true);
    setIsAdmin(false);
    setAdmin(null);
    setStaff(null);
    setPermissions({});
    setStatus("unauthenticated");
    setMode("live");
  }, []);

  const can = useCallback(
    (capability: Capability, action: "view" | "edit" = "view") => {
      // Owners (and the shared-password fallback session) see everything.
      if (isOwner) return true;
      const grant = permissions[capability];
      if (!grant) return false;
      return action === "edit" ? grant.edit : grant.view;
    },
    [isOwner, permissions],
  );

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
    if (!isAuthed) return null;
    // A super-admin is not a client user: they have no tenant identity and must
    // route into /admin, never a client surface. Route guards handle that; here
    // we just refuse to fabricate an owner identity for them.
    if (isAdmin) return null;
    // Staff session: the logged-in employee IS the identity, with their own
    // role. No "who are you?" picker (that is the owner shared-login flow).
    if (staff) {
      return {
        id: staff.id,
        clientId: "",
        name: staff.name,
        email: staff.email,
        role: staff.role,
      };
    }
    // Real resolved identity from /api/me/identity when available.
    if (identity) return identity;
    // A stored identity that failed to resolve for transient reasons must not
    // silently get the owner UI; degrade to a minimal rep until it resolves.
    if (identityFailed && identityId) {
      return {
        id: identityId,
        clientId: "",
        name: "Team member",
        email: "",
        role: "rep" as Role,
      };
    }
    // Fallback: hardcoded owner (no identity chosen / skipped, single-operator
    // account assumption).
    return {
      id: "owner",
      clientId: "",
      name: "Owner",
      email: "",
      role: "owner" as Role,
    };
  }, [override, isAuthed, isAdmin, staff, identity, identityFailed, identityId]);

  // Only prompt the picker fully online: offline, the team list behind it
  // cannot load, and the offline-grace session may be seconds from sign-out.
  // Staff sessions never see it (they already have a named identity + role).
  const needsIdentity = useMemo(
    () =>
      !override &&
      !staff &&
      !isAdmin &&
      status === "authenticated" &&
      identityResolved &&
      !hasIdentityChoice,
    [override, staff, isAdmin, status, identityResolved, hasIdentityChoice],
  );

  const session = useMemo<{ authenticated: true } | null>(
    () => (isAuthed ? { authenticated: true } : null),
    [isAuthed],
  );

  const value = useMemo(
    () => ({
      status,
      session,
      mode,
      isAdmin,
      admin,
      adminChecked: status !== "loading",
      isOwner,
      staff,
      permissions,
      can,
      signInWithPassword,
      signInAsStaff,
      signInAsAdmin,
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
      isAdmin,
      admin,
      isOwner,
      staff,
      permissions,
      can,
      signInWithPassword,
      signInAsStaff,
      signInAsAdmin,
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
