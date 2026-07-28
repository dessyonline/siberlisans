import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const DEALER_CODE_KEY = "sp_dealer_code";

/** Kullanıcı giriş yaptığında localStorage'daki bayi kodunu hesabına bağlar. */
export function DealerAttach() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem(DEALER_CODE_KEY);
    } catch {
      return;
    }
    if (!code) return;
    supabase
      .rpc("attach_dealer_code", { _code: code })
      .then(() => {
        try {
          localStorage.removeItem(DEALER_CODE_KEY);
        } catch {
          /* ignore */
        }
      });
  }, [user]);

  return null;
}
