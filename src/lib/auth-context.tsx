import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMe, signOut as signOutFn, type AuthUser } from "@/lib/auth.functions";

type Role = "admin" | "user";

interface AuthState {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  roles: Role[];
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchMe = useServerFn(getMe);
  const doSignOut = useServerFn(signOutFn);

  const refresh = useCallback(async () => {
    try {
      const me = (await fetchMe()) as AuthUser | null;
      setUser(me ?? null);
    } catch (err) {
      console.error("Oturum bilgisi alınamadı:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchMe]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = async () => {
    await doSignOut({ data: undefined as never }).catch(() => {});
    setUser(null);
  };

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
