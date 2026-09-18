import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { attachDealerCode } from "@/lib/dealer.functions";
import { useAuth } from "@/lib/auth-context";

export const DEALER_CODE_KEY = "sp_dealer_code";

/** Kullanıcı giriş yaptığında localStorage'daki bayi kodunu hesabına bağlar. */
export function DealerAttach() {
  const { user } = useAuth();
  const attach = useServerFn(attachDealerCode);

  useEffect(() => {
    if (!user) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem(DEALER_CODE_KEY);
    } catch {
      return;
    }
    if (!code) return;
    attach({ data: { code } }).then(() => {
      try {
        localStorage.removeItem(DEALER_CODE_KEY);
      } catch {
        /* ignore */
      }
    });
  }, [user, attach]);

  return null;
}
