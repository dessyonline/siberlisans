import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMe, signOut as signOutFn, type AuthUser, type SessionResult } from "@/lib/auth.functions";

type Role = "admin" | "user";

interface AuthState {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  roles: Role[];
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  acceptUser: (user: AuthUser) => void;
  serviceUnavailable: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const fetchMe = useServerFn(getMe);
  const doSignOut = useServerFn(signOutFn);

  const refresh = useCallback(async () => {
    try {
      const result = (await fetchMe()) as SessionResult;
      setServiceUnavailable(false);
      if (result.status === "authenticated") {
        setUser(result.user);
        return result.user;
      }
      setUser(null);
      return null;
    } catch (err) {
      console.error("Oturum bilgisi alınamadı:", err);
      setServiceUnavailable(true);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchMe]);

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  const signOut = async () => {
    await doSignOut({ data: undefined as never }).catch(() => {});
    setUser(null);
    setServiceUnavailable(false);
  };

  const acceptUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setServiceUnavailable(false);
    setLoading(false);
  }, []);

  const roles = (user?.roles ?? []) as Role[];

  return (
    <AuthCtx.Provider
      value={{
        session: user ? { user } : null,
        user,
        roles,
        isAdmin: roles.includes("admin"),
        loading,
        refresh,
        acceptUser,
        serviceUnavailable,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
