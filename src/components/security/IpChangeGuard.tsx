import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { touchSessionIp } from "@/lib/session-guard.functions";
import { MfaGateDialog } from "@/components/security/MfaGateDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Globe2, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { isDeviceTrusted } from "@/lib/trusted-device";

/**
 * Girişten sonra kullanıcının IP'sini kontrol eder.
 * - MFA yok  → siber temalı uyarı ekranı + /guvenlik yönlendirme CTA
 * - MFA var  → step-up 2FA modalı (güvenilir cihazsa atlanır)
 * Her tab başına en fazla bir kere kontrol eder (SIGNED_IN olayında yeniden çalışır).
 */
export function IpChangeGuard() {
  const touchFn = useServerFn(touchSessionIp);
  const navigate = useNavigate();
  const [gateOpen, setGateOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [prevIp, setPrevIp] = useState<string | null>(null);
  const [currIp, setCurrIp] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const checked = useRef(false);

  const runCheck = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      setUserId(userData.user.id);
      const res = await touchFn({});
      if (!res.ipChanged) return;

      setPrevIp(res.previousIp ?? null);
      setCurrIp(res.currentIp ?? null);

      // MFA kurulu mu?
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
      if (!hasTotp) {
        // 2FA yok → siber temalı tam ekran uyarı
        setWarnOpen(true);
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return; // Bu oturumda zaten doğrulandı

      // Güvenilir cihaz mı?
      if (isDeviceTrusted(userData.user.id)) {
        toast.info("[·] farklı IP algılandı — güvenilir cihaz, doğrulama atlandı", {
          duration: 5000,
        });
        return;
      }

      // Step-up iste
      toast.warning("[!] IP değişikliği algılandı — 2FA doğrulaması gerekiyor", {
        duration: 6000,
      });
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
        runCheck();
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mask = (ip: string | null) => {
    if (!ip) return "—.—.—.—";
    // IPv4: ilk iki oktet, IPv6: ilk grup
    if (ip.includes(".")) {
      const p = ip.split(".");
      return p.length === 4 ? `${p[0]}.${p[1]}.***.***` : ip;
    }
    if (ip.includes(":")) {
      const p = ip.split(":").filter(Boolean);
      return `${p[0] ?? "::"}:****:****`;
    }
    return ip;
  };

  return (
    <>
      <MfaGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        userId={userId}
        title="IP değişikliği doğrulaması"
        description="Farklı bir IP adresinden bağlanıyorsun. Devam etmek için authenticator kodunu gir."
        onSuccess={() => {
          toast.success("[✓] doğrulandı");
          navigate({ to: "/hesabim" });
        }}
      />

      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent className="max-w-md border-warn/50 bg-background/95 backdrop-blur p-0 overflow-hidden">
          {/* Cyber grid arka plan */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 cyber-grid"
          />
          {/* Üst şerit — scan line efekti */}
          <div className="relative border-b border-warn/40 bg-warn/5 px-5 py-3">
            <div className="scan-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-warn to-transparent" />
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-warn">
                <ShieldAlert className="h-4 w-4 animate-pulse" />
                security_alert :: ip_mismatch
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="relative px-5 pt-4 pb-5 space-y-4">
            <div className="font-mono text-[11px] text-muted-foreground leading-relaxed">
              <span className="text-warn">[!]</span> Hesabına <span className="text-warn font-semibold">farklı bir IP adresinden</span>{" "}
              erişim algılandı. Bu sen değilsen hesabın risk altında olabilir.
            </div>

            {/* Terminal-vari IP kutusu */}
            <div className="rounded-md border border-warn/30 bg-black/40 p-3 font-mono text-[11px] space-y-1.5">
              <div className="flex items-center gap-2 text-warn/80 text-[10px]">
                <Globe2 className="h-3 w-3" />
                <span>$ trace --session</span>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-1">
                <span className="text-muted-foreground">önceki_ip →</span>
                <span className="text-foreground">{mask(prevIp)}</span>
                <span className="text-muted-foreground">yeni_ip &nbsp;&nbsp;→</span>
                <span className="text-warn">{mask(currIp)}</span>
                <span className="text-muted-foreground">2fa_status →</span>
                <span className="text-destructive">disabled</span>
              </div>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
              <div className="text-primary font-semibold mb-1">// önerilen aksiyon</div>
              Hesabına <span className="text-primary">iki adımlı doğrulama (2FA)</span>{" "}
              ekle. Şifren çalınsa bile ek kod olmadan giriş yapılamaz.
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => {
                  setWarnOpen(false);
                  navigate({ to: "/guvenlik" });
                }}
                className="font-mono neon-glow flex-1"
              >
                {"> "}şimdi 2FA kur
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => setWarnOpen(false)}
                className="font-mono text-xs text-muted-foreground"
              >
                <X className="mr-1 h-3.5 w-3.5" /> daha sonra
              </Button>
            </div>

            <div className="font-mono text-[10px] text-muted-foreground/70 border-t border-border/40 pt-2">
              Bu bağlantı sensen bu uyarıyı yok sayabilirsin. Değilsen{" "}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  setWarnOpen(false);
                  navigate({ to: "/auth" });
                }}
                className="text-warn hover:text-destructive underline underline-offset-2"
              >
                tüm oturumları kapat
              </button>{" "}
              ve şifreni değiştir.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
