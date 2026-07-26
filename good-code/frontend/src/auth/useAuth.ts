import { createContext, useContext } from "react";

export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  // Exchange a Google ID token (credential) for a session, persisting it.
  login: (credential: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

// Convenience helper for attaching the bearer token to an axios request.
export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
