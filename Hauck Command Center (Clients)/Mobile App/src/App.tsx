import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./context/ThemeContext";
import { ClientProvider } from "./context/ClientContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LeadsProvider } from "./context/LeadsContext";
import { PipelinesProvider } from "./context/PipelinesContext";
import Login from "./routes/Login";
import Home from "./routes/Home";
import Leads from "./routes/Leads";
import Dashboard from "./routes/Dashboard";
import { PaidAds } from "./routes/PaidAds";
import { Activity } from "./routes/Activity";
import Contacts from "./routes/Contacts";
import Conversations from "./routes/Conversations";
import ConversationDetail from "./routes/ConversationDetail";
import LeadDetail from "./routes/LeadDetail";
import Today from "./routes/Today";
import Billing from "./routes/Billing";
import Calendar from "./routes/Calendar";
import Notifications from "./routes/Notifications";
import Team from "./routes/Team";
import Settings from "./routes/Settings";
import Shell from "./components/Shell";
import IdentityPicker from "./components/IdentityPicker";
import OfflineBanner from "./components/OfflineBanner";
import ScrollToTop from "./components/ScrollToTop";
import { ToastProvider } from "./context/ToastContext";
import { NowProvider } from "./context/NowContext";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, currentUser, needsIdentity, setIdentity } = useAuth();
  if (status === "loading") return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  // One-time "who are you?" step after the shared-password login. Skipping
  // (or any failure) falls back to the hardcoded-owner default in AuthContext.
  if (needsIdentity) {
    return (
      <Shell>
        <IdentityPicker onPick={setIdentity} />
      </Shell>
    );
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { status, mode } = useAuth();
  if (status === "loading") return null;
  // Offline grace: nobody can sign in without a network, so any plausible
  // previous session (either mode) goes to the cached dashboard, not /login.
  if (status === "authenticated-offline") {
    return <Navigate to="/home" replace />;
  }
  // Live sessions (clients) stay logged in and skip straight to the
  // dashboard. Test sessions (internal) always land on the login screen.
  if (status === "authenticated" && mode === "live") {
    return <Navigate to="/home" replace />;
  }
  return <Navigate to="/login" replace />;
}

// Bridge from the service worker into the running app. "push": a push landed,
// refresh the bell/feed immediately instead of waiting for the next poll.
// "navigate": a notification was tapped while a window exists; route in the
// SPA rather than the full-reload win.navigate the SW used to do.
function ServiceWorkerMessages() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === "push") {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["activity"] });
      } else if (data?.type === "navigate" && data.url) {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ClientProvider>
          <PipelinesProvider>
          <LeadsProvider>
          <NowProvider>
          <ToastProvider>
            <ServiceWorkerMessages />
            <OfflineBanner />
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leads"
                element={
                  <ProtectedRoute>
                    <Leads />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/paid-ads"
                element={
                  <ProtectedRoute>
                    <PaidAds />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/activity"
                element={
                  <ProtectedRoute>
                    <Activity />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ProtectedRoute>
                    <Contacts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conversations"
                element={
                  <ProtectedRoute>
                    <Conversations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conversations/:contactId"
                element={
                  <ProtectedRoute>
                    <ConversationDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/today"
                element={
                  <ProtectedRoute>
                    <Today />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/billing"
                element={
                  <ProtectedRoute>
                    <Billing />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <Calendar />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <Notifications />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              {/* Owner-only inside the component (staff are redirected home);
                  the backend also enforces owner-only on every /api/staff call. */}
              <Route
                path="/team"
                element={
                  <ProtectedRoute>
                    <Team />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lead/:id"
                element={
                  <ProtectedRoute>
                    <LeadDetail />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </ToastProvider>
          </NowProvider>
          </LeadsProvider>
          </PipelinesProvider>
        </ClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
