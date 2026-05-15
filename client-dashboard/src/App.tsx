import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./routes/Login";
import Dashboard from "./routes/Dashboard";
import LeadDetail from "./routes/LeadDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/lead/:id" element={<LeadDetail />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
