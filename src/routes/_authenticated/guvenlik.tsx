import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Trash2, ArrowLeft, Terminal, MonitorSmartphone, LogOut } from "lucide-react";
import { MfaEnroll } from "@/components/security/MfaEnroll";
import { MfaChallenge } from "@/components/security/MfaChallenge";
import { getMfaStatus, mfaDisable, signOutOtherSessions, type MfaStatus } from "@/lib/mfa.functions";
import {
  trustedDeviceExpiry,
  untrustDevice,
  TRUSTED_DEVICE_TTL_DAYS,
  MAX_TRUSTED_DEVICES,
  getDeviceId,
  listTrustedDevices,
  removeTrustedDevice,
  type TrustedDeviceRow,
} from "@/lib/trusted-device";

export const Route = createFileRoute("/_authenticated/guvenlik")({
  component: SecurityPage,
  head: () => ({
    meta: [
      { title: "Güvenlik — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function RemoveMfaForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const disableFn = useServerFn(mfaDisable);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const cleaned = code.replace(/\s/g, "");
    if (cleaned.length !== 6) return toast.error("[!] 6 haneli kod gir");
    setLoading(true);
    try {
      await disableFn({ data: { code: cleaned } });
      onSuccess();
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2 font-mono text-sm text-primary">
        <ShieldCheck className="h-4 w-4" /> kaldırma onayı
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
      <div className="flex gap-2">
        <Button disabled={loading || code.length !== 6} onClick={submit} className="font-mono neon-glow flex-1">
          {loading ? "…" : "> kaldır"}
        </Button>
        <Button variant="outline" className="font-mono" onClick={onCancel}>
          iptal
        </Button>
      </div>
    </div>
  );
}

function SecurityPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const mfaStatusFn = useServerFn(getMfaStatus);
  const signOutOthersFn = useServerFn(signOutOtherSessions);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"idle" | "enroll" | "verify-remove" | "step-up">("idle");
  const [trustedUntil, setTrustedUntil] = useState<Date | null>(null);
  const [devices, setDevices] = useState<TrustedDeviceRow[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const refresh = async () => {
    setLoading(true);
    const s = await mfaStatusFn().catch(() => null);
    setStatus(s);
    setTrustedUntil(trustedDeviceExpiry(userId));
    setCurrentDeviceId(getDeviceId());
    setDevices(userId ? await listTrustedDevices() : []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const enabled = !!status?.enrolled;
  const aal = status?.aal ?? null;

  const doRemove = async () => {
    untrustDevice(userId);
    try {
      await signOutOthersFn();
    } catch {
      /* noop */
    }
    toast.success("[✓] 2FA kaldırıldı · diğer oturumlar sonlandırıldı");
    setMode("idle");
    refresh();
  };

  const signOutOthers = async () => {
    try {
      await signOutOthersFn();
      toast.success("[✓] diğer tüm cihazlardan çıkış yapıldı");
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Terminal className="h-3.5 w-3.5 text-primary" /> $ ./security --panel
          </div>
          <h1 className="mt-1 font-mono text-2xl neon-text">Güvenlik</h1>
        </div>
        <Link to="/hesabim" className="font-mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> hesabım
        </Link>
      </div>

      {/* Admin uyarısı */}
      {!loading && isAdmin && aal !== "aal2" && (
        <div className="rounded-md border border-warn/40 bg-warn/5 p-4 font-mono text-xs">
          <div className="flex items-center gap-2 text-warn">
            <ShieldAlert className="h-4 w-4" />
            <span className="font-semibold">admin paneline erişim için 2FA gerekiyor</span>
          </div>
          <div className="mt-1 text-muted-foreground">
            {enabled
              ? "Bu oturumda henüz 2FA doğrulaması yapmadın. Aşağıdan doğrula, sonra admin paneline gidebilirsin."
              : "Önce 2FA'yı kur, sonra /admin sayfasına yönlendirileceksin."}
          </div>
          {enabled && (
            <Button
              size="sm"
              className="mt-3 font-mono neon-glow"
              onClick={() => setMode("step-up")}
            >
              {"> "}şimdi doğrula
            </Button>
          )}
        </div>
      )}

      {/* 2FA kart */}
      <div className="glass-card rounded-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-2 ${enabled ? "bg-primary/15 text-primary" : "bg-warn/10 text-warn"}`}>
            {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold">İki Adımlı Doğrulama (2FA)</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
              Authenticator uygulamasıyla üretilen 6 haneli kod ile hesabına ekstra bir güvenlik katmanı ekle.
              Şifren çalınsa bile telefonuna erişimi olmayan biri hesabına giremez.
            </div>
            <div className="mt-2 font-mono text-[10px]">
              durum:{" "}
              {loading ? (
                <span className="text-muted-foreground">…</span>
              ) : enabled ? (
                <span className="text-primary">[✓] aktif</span>
              ) : (
                <span className="text-warn">[!] devre dışı</span>
              )}
              {enabled && aal && (
                <span className="ml-2 text-muted-foreground">· oturum: {aal}</span>
              )}
            </div>
          </div>
        </div>

        {mode === "idle" && !enabled && (
          <Button onClick={() => setMode("enroll")} className="font-mono neon-glow w-full sm:w-auto">
            {"> "}2FA'yı kur
          </Button>
        )}

        {mode === "enroll" && (
          <div className="border-t border-border/40 pt-4">
            <MfaEnroll
              onDone={() => {
                setMode("idle");
                refresh();
              }}
            />
            <button
              onClick={() => setMode("idle")}
              className="mt-3 font-mono text-[10px] text-muted-foreground hover:text-primary"
            >
              ← vazgeç
            </button>
          </div>
        )}

        {mode === "verify-remove" && (
          <div className="border-t border-border/40 pt-4">
            <div className="mb-3 rounded-md border border-warn/30 bg-warn/5 p-3 font-mono text-[11px] text-warn">
              [!] 2FA kaldırmak için önce mevcut 2FA kodunla doğrulanman gerekiyor.
            </div>
            <RemoveMfaForm onCancel={() => setMode("idle")} onSuccess={doRemove} />
          </div>
        )}

        {mode === "step-up" && enabled && (
          <div className="border-t border-border/40 pt-4">
            <MfaChallenge
              title="oturum doğrulama"
              onCancel={() => setMode("idle")}
              onSuccess={async () => {
                setMode("idle");
                await refresh();
                toast.success("[✓] doğrulandı — admin paneline yönlendiriliyorsun");
                if (isAdmin) navigate({ to: "/admin" });
              }}
            />
          </div>
        )}

        {enabled && mode === "idle" && (
          <div className="border-t border-border/40 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">authenticator</div>
                {status?.createdAt && (
                  <div className="font-mono text-[10px] text-muted-foreground">
                    eklendi: {new Date(status.createdAt).toLocaleDateString("tr-TR")}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode("verify-remove")}
                className="font-mono text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Güvenilir cihazlar */}
      {enabled && (
        <div className="glass-card rounded-lg p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md p-2 bg-primary/10 text-primary">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm font-semibold">Güvenilir Cihazlar</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
                2FA doğrulamasında "bu cihazı hatırla" seçtiğinde bu tarayıcıda{" "}
                {TRUSTED_DEVICE_TTL_DAYS} gün boyunca satın alma / hassas işlem
                modalları sana tekrar kod sormaz. Admin paneline erişim gibi
                oturum-bazlı zorunluluklar bundan etkilenmez.
              </div>
              <div className="mt-2 font-mono text-[10px]">
                bu cihaz:{" "}
                {trustedUntil ? (
                  <span className="text-primary">
                    [✓] hatırlanıyor · bitiş {trustedUntil.toLocaleDateString("tr-TR")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">[·] hatırlanmıyor</span>
                )}
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  kayıtlı cihazlar ({devices.length}/{MAX_TRUSTED_DEVICES})
                </div>
                {devices.length === 0 ? (
                  <div className="font-mono text-[11px] text-muted-foreground">
                    [·] henüz kayıtlı güvenilir cihaz yok
                  </div>
                ) : (
                  devices.map((d) => {
                    const isCurrent = d.device_id === currentDeviceId;
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2 font-mono text-[11px]"
                      >
                        <div className="min-w-0">
                          <div className="truncate">
                            {d.label ?? "Bilinmeyen cihaz"}{" "}
                            {isCurrent && <span className="text-primary">· bu cihaz</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            son görülme {new Date(d.last_seen_at).toLocaleString("tr-TR")}
                            {d.trusted_until
                              ? ` · bitiş ${new Date(d.trusted_until).toLocaleDateString("tr-TR")}`
                              : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="font-mono text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            await removeTrustedDevice(d.id);
                            if (isCurrent) {
                              untrustDevice(userId);
                              setTrustedUntil(null);
                            }
                            setDevices(await listTrustedDevices());
                            toast.success("[✓] cihaz kaldırıldı");
                          }}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> kaldır
                        </Button>
                      </div>
                    );
                  })
                )}
                <div className="font-mono text-[10px] text-muted-foreground/70">
                  en fazla {MAX_TRUSTED_DEVICES} cihaz hatırlanır; yeni cihaz eklenince en eskisi
                  otomatik düşer. Kayıtlı cihazlardan giriş yapmak diğerini oturumdan düşürmez.
                </div>
              </div>

            </div>
          </div>
        </div>
      )}


      {/* Aktif oturumlar */}
      <div className="glass-card rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md p-2 bg-warn/10 text-warn">
            <LogOut className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold">Diğer Cihazlardan Çıkış</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
              Hesabında başka telefon veya bilgisayarda açık oturum kaldığından
              şüphelenirsen buradan hepsini anında sonlandır. Bu cihazdaki
              oturumun etkilenmez.
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 font-mono border-warn/40 text-warn hover:bg-warn/10"
              onClick={signOutOthers}
            >
              <LogOut className="mr-1.5 h-3 w-3" /> tüm diğer oturumları kapat
            </Button>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-lg p-4 font-mono text-[11px] text-muted-foreground space-y-1">
        <div className="text-primary">// ipucu</div>
        <div>· admin paneli için 2FA <span className="text-primary">zorunludur</span>.</div>
        <div>· 2FA kaldırırken <span className="text-primary">her seferinde</span> taze kod istenir; bir başkası oturumunu ele geçirse bile sökemez.</div>
        <div>· şüpheli erişimde önce "diğer oturumları kapat", sonra şifreni değiştir.</div>
        <div>· telefonunu kaybedersen destek üzerinden kimlik doğrulaması ile sıfırlanır.</div>
      </div>
    </div>
  );
}
