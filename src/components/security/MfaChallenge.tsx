import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { trustDevice, TRUSTED_DEVICE_TTL_DAYS } from "@/lib/trusted-device";

/**
 * MfaChallenge — hesabında totp factor olan kullanıcı için 6 haneli kod doğrulaması.
 * onSuccess çağrıldıktan sonra `supabase.auth.getUser()` aal2 döner.
 * userId verilirse "bu cihazı hatırla" seçeneği gösterilir; işaretlenirse
 * bu tarayıcıda 30 gün boyunca step-up 2FA modalları atlanır.
 */
export function MfaChallenge({
  factorId,
  userId,
  onSuccess,
  onCancel,
  title = "iki adımlı doğrulama",
  showRememberDevice = true,
}: {
  factorId?: string;
  userId?: string | null;
  onSuccess: () => void;
  onCancel?: () => void;
  title?: string;
  showRememberDevice?: boolean;
}) {
  const [id, setId] = useState<string | null>(factorId ?? null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (id) return;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = (data?.totp ?? []).find((f) => f.status === "verified");
      if (totp) setId(totp.id);
    })();
  }, [id]);

  const submit = async () => {
    if (!id) return toast.error("[!] doğrulanmış factor bulunamadı");
    const cleaned = code.replace(/\s/g, "");
    if (cleaned.length !== 6) return toast.error("[!] 6 haneli kod gir");
    setLoading(true);
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: id });
    if (chalErr || !chal) {
      setLoading(false);
      return toast.error(`[!] ${chalErr?.message ?? "hata"}`);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: id,
      challengeId: chal.id,
      code: cleaned,
    });
    setLoading(false);
    if (error) {
      setCode("");
      return toast.error(`[!] ${error.message}`);
    }
    // Kullanıcı bu cihazı hatırlamamızı istediyse kaydet
    let effectiveUserId = userId ?? null;
    if (remember && !effectiveUserId) {
      const { data: u } = await supabase.auth.getUser();
      effectiveUserId = u.user?.id ?? null;
    }
    if (remember && effectiveUserId) {
      trustDevice(effectiveUserId);
      toast.success(`[✓] bu cihaz ${TRUSTED_DEVICE_TTL_DAYS} gün hatırlanacak`);
    }
    onSuccess();
  };

  return (
    <div className="glass-card rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2 font-mono text-sm text-primary">
        <ShieldCheck className="h-4 w-4" /> {title}
      </div>
      <div className="font-mono text-[11px] text-muted-foreground">
        authenticator uygulamandan 6 haneli kodu gir.
      </div>
      <Input
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="font-mono text-center tracking-[0.4em] text-lg"
      />
      {showRememberDevice && (
        <label className="flex items-start gap-2 font-mono text-[11px] text-muted-foreground cursor-pointer select-none">
          <Checkbox
            checked={remember}
            onCheckedChange={(v) => setRemember(Boolean(v))}
            className="mt-0.5"
          />
          <span>
            bu cihazı {TRUSTED_DEVICE_TTL_DAYS} gün hatırla
            <span className="block text-muted-foreground/70">
              paylaşımlı / halka açık cihazlarda işaretleme
            </span>
          </span>
        </label>
      )}
      <div className="flex gap-2">
        <Button disabled={loading || code.length !== 6} onClick={submit} className="font-mono neon-glow flex-1">
          {loading ? "…" : "> doğrula"}
        </Button>
        {onCancel && (
          <Button variant="outline" className="font-mono" onClick={onCancel}>
            iptal
          </Button>
        )}
      </div>
    </div>
  );
}


/** Kullanıcının mevcut AAL seviyesini oku. aal2 => doğrulanmış 2FA oturumu. */
export async function getCurrentAal(): Promise<"aal1" | "aal2" | null> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return (data?.currentLevel as "aal1" | "aal2" | null) ?? null;
}

/** Kullanıcının doğrulanmış totp factor'ı var mı? */
export async function hasVerifiedTotp(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).some((f) => f.status === "verified");
}
