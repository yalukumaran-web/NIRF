import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import OfficialRankings from "./pages/OfficialRankings";
import Compare from "./pages/Compare";
import Calculations from "./pages/Calculations";
import Documents from "./pages/Documents";
import Mldashboard from "./pages/Mldashboard";
import AbsoluteCalculator from "./pages/AbsoluteCalculator";

function ProtectedLayout() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/rankings" element={<OfficialRankings />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/calculations" element={<Calculations />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/absolute" element={<AbsoluteCalculator />} />
            <Route path="/admin/ml" element={<Mldashboard />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}