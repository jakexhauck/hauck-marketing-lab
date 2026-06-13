import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/shell/AppShell";
import { Spinner } from "@/components/ui";
import { Login } from "@/routes/Login";
import { Overview } from "@/routes/Overview";
import { Pipeline } from "@/routes/Pipeline";
import { Inbox } from "@/routes/Inbox";
import { Contacts } from "@/routes/Contacts";
import { Calendar } from "@/routes/Calendar";
import { Billing } from "@/routes/Billing";
import { Activity } from "@/routes/Activity";

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

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Overview />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/activity" element={<Activity />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
