import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import api from "../services/api";
import type { Institution, User } from "../types";

interface AuthState {
  user: User | null;
  institution: Institution | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    institutionName: string,
    category: string
  ) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token")
  );

  useEffect(() => {
    if (token) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.user);
      setInstitution(res.data.institution);
    } catch {
      logout();
    }
  }

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    await refresh();
  }

  async function register(
    email: string,
    password: string,
    institutionName: string,
    category: string
  ) {
    const res = await api.post("/auth/register", {
      email,
      password,
      institutionName,
      category,
    });
    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    await refresh();
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setInstitution(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, institution, token, login, register, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
