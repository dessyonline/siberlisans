import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { touchSessionIp } from "@/lib/session-guard.functions";
import { MfaGateDialog } from "@/components/security/MfaGateDialog";
import { toast } from "sonner";

/**
 * Girişten sonra kullanıcının IP'sini kontrol eder.
 * IP değişmiş VE 2FA kurulu ise step-up ister.
 * Her tab başına en fazla bir kere kontrol eder (SIGNED_IN olayında yeniden çalışır).
 */
export function IpChangeGuard() {
  const touchFn = useServerFn(touchSessionIp);
  const navigate = useNavigate();
  const [gateOpen, setGateOpen] = useState(false);
  const checked = useRef(false);

  const runCheck = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const res = await touchFn({});
      if (!res.ipChanged) return;

      // MFA kurulu mu?
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
      if (!hasTotp) {
        // MFA yoksa sadece bilgi
        toast.warning("[!] farklı bir IP'den giriş algılandı", {
          description: "Güvenliğin için Hesabım → Güvenlik'ten 2FA kurmanı öneririz.",
          duration: 8000,
        });
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return; // Bu oturumda zaten doğrulandı

      // Step-up iste
      toast.warning("[!] IP değişikliği algılandı — 2FA doğrulaması gerekiyor", { duration: 6000 });
      setGateOpen(true);
    } catch (e) {
      // Sessizce yut — kritik değil
      console.warn("IpChangeGuard:", (e as Error).message);
    }
  };

  useEffect(() => {
    if (!checked.current) {
      checked.current = true;
      runCheck();
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // Yeni oturum → tekrar kontrol
        runCheck();
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MfaGateDialog
      open={gateOpen}
      onOpenChange={setGateOpen}
      title="IP değişikliği doğrulaması"
      description="Farklı bir IP adresinden bağlanıyorsun. Devam etmek için authenticator kodunu gir."
      onSuccess={() => {
        toast.success("[✓] doğrulandı");
        navigate({ to: "/hesabim" });
      }}
    />
  );
}
