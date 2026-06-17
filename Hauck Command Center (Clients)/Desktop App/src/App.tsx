import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import type { Capability } from "@hauck/core";
import { useAuth } from "@/context/AuthContext";
import { NAV, filterNav } from "@/lib/nav";
import { AppShell } from "@/components/shell/AppShell";
import { Spinner } from "@/components/ui";
import { Login } from "@/routes/Login";
import { Overview } from "@/routes/Overview";
import { PaidAds } from "@/routes/PaidAds";
import { Pipeline } from "@/routes/Pipeline";
import { Inbox } from "@/routes/Inbox";
import { Contacts } from "@/routes/Contacts";
import { Calendar } from "@/routes/Calendar";
import { Billing } from "@/routes/Billing";
import { Activity } from "@/routes/Activity";
import { Team } from "@/routes/Team";
import { AdminClients } from "@/routes/admin/AdminClients";
import { AdminClientDetail } from "@/routes/admin/AdminClientDetail";

function FullScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg">
      <Spinner size={24} />
    </div>
  );
}

function ProtectedRoute() {
  const { status } = useAuth();
  if (status === "loading") return <FullScreen />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <AppShell />;
}

function LoginGate() {
  const { status } = useAuth();
  if (status === "loading") return <FullScreen />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Login />;
}

// The first surface this user can actually open, used to bounce them off a
// surface they lack access to. Falls back to a no-access screen when a staff
// member has been granted nothing.
function useFirstAllowedPath(): string | null {
  const { isAdmin, isOwner, can } = useAuth();
  // Admins live in the control tower, never on a tenant surface.
  if (isAdmin) return "/admin";
  const visible = filterNav(NAV, { isOwner, can }).filter((n) => !n.ownerOnly);
  return visible[0]?.to ?? null;
}

function NoAccess() {
  const { signOut, staff } = useAuth();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-xl text-text">No surfaces assigned</h1>
      <p className="max-w-sm text-sm text-muted">
        {staff?.name ? `${staff.name}, your` : "Your"} account doesn't have access to anything
        yet. Ask the business owner to grant you a surface from the Team screen.
      </p>
      <button
        onClick={() => void signOut()}
        className="mt-1 rounded-[var(--radius-sm)] border border-border px-3 py-1.5 text-[13px] text-muted hover:text-text"
      >
        Sign out
      </button>
    </div>
  );
}

// Gate a surface on a view capability. Owners always pass. A staff member who
// lacks it is bounced to their first allowed surface (or the no-access screen).
function RequireCap({ capability, children }: { capability: Capability; children: ReactElement }) {
  const { can } = useAuth();
  const first = useFirstAllowedPath();
  if (can(capability, "view")) return children;
  if (!first) return <NoAccess />;
  return <Navigate to={first} replace />;
}

function RequireOwner({ children }: { children: ReactElement }) {
  const { isOwner } = useAuth();
  const first = useFirstAllowedPath();
  if (isOwner) return children;
  if (!first) return <NoAccess />;
  return <Navigate to={first} replace />;
}

// Gate the cross-client admin surfaces on a signed admin session. A non-admin
// (owner or staff) is bounced to their first tenant surface; the backend rejects
// /api/admin/* for them regardless, so this is UI hygiene, not the real gate.
function RequireAdmin({ children }: { children: ReactElement }) {
  const { isAdmin } = useAuth();
  const first = useFirstAllowedPath();
  if (isAdmin) return children;
  if (!first) return <NoAccess />;
  return <Navigate to={first} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RequireCap capability="overview"><Overview /></RequireCap>} />
        <Route path="/paid-ads" element={<RequireCap capability="paid_ads"><PaidAds /></RequireCap>} />
        <Route path="/pipeline" element={<RequireCap capability="pipeline"><Pipeline /></RequireCap>} />
        <Route path="/inbox" element={<RequireCap capability="inbox"><Inbox /></RequireCap>} />
        <Route path="/contacts" element={<RequireCap capability="contacts"><Contacts /></RequireCap>} />
        <Route path="/calendar" element={<RequireCap capability="calendar"><Calendar /></RequireCap>} />
        <Route path="/billing" element={<RequireCap capability="billing"><Billing /></RequireCap>} />
        <Route path="/activity" element={<RequireCap capability="activity"><Activity /></RequireCap>} />
        <Route path="/team" element={<RequireOwner><Team /></RequireOwner>} />
        {/* Control tower (cross-client, admin-only) */}
        <Route path="/admin" element={<RequireAdmin><AdminClients /></RequireAdmin>} />
        <Route path="/admin/clients/:id" element={<RequireAdmin><AdminClientDetail /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
