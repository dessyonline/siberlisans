import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mfaVerifyCode, getMfaStatus } from "@/lib/mfa.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { trustDevice, TRUSTED_DEVICE_TTL_DAYS } from "@/lib/trusted-device";

/**
 * MfaChallenge — hesabında totp factor olan kullanıcı için 6 haneli kod doğrulaması.
 * onSuccess çağrıldıktan sonra bu oturum aal2 olur.
 * userId verilirse "bu cihazı hatırla" seçeneği gösterilir; işaretlenirse
 * bu tarayıcıda 30 gün boyunca step-up 2FA modalları atlanır.
 */
export function MfaChallenge({
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
  const verifyCode = useServerFn(mfaVerifyCode);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  const submit = async () => {
    const cleaned = code.replace(/\s/g, "");
    if (cleaned.length !== 6) return toast.error("[!] 6 haneli kod gir");
    setLoading(true);
    try {
      await verifyCode({ data: { code: cleaned } });
    } catch (e) {
      setLoading(false);
      setCode("");
      return toast.error(`[!] ${(e as Error).message}`);
    }
    setLoading(false);

    // Kullanıcı bu cihazı hatırlamamızı istediyse kaydet
    if (remember && userId) {
      const { trustDeviceRemote } = await import("@/lib/trusted-device");
      await trustDeviceRemote(userId);
      toast.success(`[✓] bu cihaz ${TRUSTED_DEVICE_TTL_DAYS} gün hatırlanacak (en fazla 2 cihaz)`);
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
  try {
    const status = await getMfaStatus();
    return status.aal;
  } catch {
    return null;
  }
}

/** Kullanıcının doğrulanmış totp factor'ı var mı? */
export async function hasVerifiedTotp(): Promise<boolean> {
  try {
    const status = await getMfaStatus();
    return status.enrolled;
  } catch {
    return false;
  }
}
