import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { ClientProvider } from "./context/ClientContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LeadsProvider } from "./context/LeadsContext";
import Login from "./routes/Login";
import Dashboard from "./routes/Dashboard";
import Contacts from "./routes/Contacts";
import Conversations from "./routes/Conversations";
import ConversationDetail from "./routes/ConversationDetail";
import LeadDetail from "./routes/LeadDetail";
import Today from "./routes/Today";
import Showroom from "./routes/Showroom";
import Simulator from "./routes/Simulator";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, currentUser } = useAuth();
  if (status === "loading") return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { status } = useAuth();
  if (status === "loading") return null;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ClientProvider>
          <LeadsProvider>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/showroom" element={<Showroom />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
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
                path="/lead/:id"
                element={
                  <ProtectedRoute>
                    <LeadDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/simulator"
                element={
                  <ProtectedRoute>
                    <Simulator />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </LeadsProvider>
        </ClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
