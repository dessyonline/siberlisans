import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "user";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: Role[];
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer role fetch — don't await inside listener
        setTimeout(() => {
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", s.user.id)
            .then(({ data }) => setRoles((data ?? []).map((r) => r.role as Role)));
        }, 0);
      } else {
        setRoles([]);
      }
    });

    const initializeAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        if (data.session?.user) {
          const { data: r } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.session.user.id);
          setRoles((r ?? []).map((x) => x.role as Role));
        }
      } catch (err) {
        console.warn("Auth backend unavailable, checking local session");
        const { storage } = await import("@/lib/local-storage");
        const localUser = await storage.getItem("user_profile");
        if (localUser) {
          // Mock session for local dev
          setSession({ user: localUser, access_token: 'local-token' } as any);
          setRoles(['user']);
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user ?? null,
        roles,
        isAdmin: roles.includes("admin"),
        loading,
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
