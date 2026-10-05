import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Upload from "./pages/Upload";
import AbsoluteCalculator from "./pages/AbsoluteCalculator";
import RelativeCalculator from "./pages/RelativeCalculator";
import DiffCalculator from "./pages/DiffCalculator";
import ModelPredictor from "./pages/ModelPredictor";

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
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<Navigate to="/relative" replace />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/absolute" element={<AbsoluteCalculator />} />
              <Route path="/diff" element={<DiffCalculator />} />
              <Route path="/relative" element={<RelativeCalculator />} />
              <Route path="/model-predict" element={<ModelPredictor />} />
            </Route>
            <Route path="*" element={<Navigate to="/relative" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}