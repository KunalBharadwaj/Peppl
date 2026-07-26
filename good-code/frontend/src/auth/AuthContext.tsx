import { useCallback, useMemo, useState, ReactNode } from "react";
import axios from "axios";
import { CONFIG } from "../config";
import { AuthContext, AuthContextValue, AuthUser } from "./useAuth";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = "peppl.auth";

function loadInitialState(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as AuthState;
    return { token: parsed.token ?? null, user: parsed.user ?? null };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitialState);

  const login = useCallback(async (credential: string) => {
    const { data } = await axios.post(`${CONFIG.controlPlaneUrl}/auth/google`, {
      credential,
    });
    const next: AuthState = { token: data.token, user: data.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ token: null, user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.token),
      login,
      logout,
    }),
    [state, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
