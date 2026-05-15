import { Routes, Route, Navigate } from "react-router-dom";
import { ClientProvider } from "./context/ClientContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LeadsProvider } from "./context/LeadsContext";
import Login from "./routes/Login";
import Dashboard from "./routes/Dashboard";
import LeadDetail from "./routes/LeadDetail";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { currentUser } = useAuth();
  return <Navigate to={currentUser ? "/dashboard" : "/login"} replace />;
}

export default function App() {
  return (
    <ClientProvider>
      <AuthProvider>
        <LeadsProvider>
          <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
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
        </LeadsProvider>
      </AuthProvider>
    </ClientProvider>
  );
}
