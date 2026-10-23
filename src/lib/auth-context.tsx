import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
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
  /** Oturum henüz yüklenmediyse sunucudan doğrular; giriş yoksa null. */
  ensureUser: () => Promise<AuthUser | null>;
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
  const protectedRouteActive = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId.startsWith("/_authenticated")),
  });

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
    if (protectedRouteActive) {
      setLoading(false);
      return;
    }
    void refresh().catch(() => {});
  }, [protectedRouteActive, refresh]);

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

  const ensureUser = useCallback(async () => {
    if (user) return user;
    // Geçici servis hatasında "giriş yok" sayıp kullanıcıyı /auth'a atma;
    // birkaç kez dene, yine olmazsa hata fırlat (yönlendirme yapılmaz).
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await refresh();
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    const { toast } = await import("sonner");
    toast.error("Bağlantı sorunu — oturumunuz açık, lütfen tekrar deneyin.");
    throw lastErr instanceof Error ? lastErr : new Error("Oturum doğrulanamadı");
  }, [user, refresh]);

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
        ensureUser,
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
